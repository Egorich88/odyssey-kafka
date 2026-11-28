"""Проверки init-скриптов на синтетических данных без Docker Engine и Kafka.

Запуск в Linux/WSL: python3 -B -m unittest discover -s docker -p test_init.py -v
Все ключи создаются исключительно во временном каталоге теста.
"""
import hashlib
import os
import json
import socket
import ssl
import threading
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class InitTests(unittest.TestCase):
    def test_https_activation_requires_served_candidate(self):
        self.run_init()
        public = self.root / "public"
        public.mkdir()
        receipt = public / "active.json"
        env = dict(self.env, ODYSSEY_TLS_STATE=str(self.root),
                   ODYSSEY_FRONTEND_OWNER=f"{os.getuid()}:{os.getgid()}",
                   ODYSSEY_PUBLIC_ORIGIN="https://localhost:19443")
        ident = "a" * 32
        def manage(action, *args, success=True):
            result = subprocess.run(["sh", str(ROOT / "docker/https-manager.sh"), action, ident, *args],
                                    env=env, capture_output=True)
            self.assertEqual(result.returncode == 0, success, result.stderr.decode())
        def serve(certdir):
            ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
            ctx.load_cert_chain(certdir / "server.crt", certdir / "server.key")
            listener = socket.socket()
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            env["ODYSSEY_TLS_PEER"] = "127.0.0.1:" + str(listener.getsockname()[1])
            def accept():
                with listener, listener.accept()[0] as conn, ctx.wrap_socket(conn, server_side=True) as peer:
                    peer.recv(1)
                    peer.unwrap().close()
            threading.Thread(target=accept, daemon=True).start()
        manage("prepare", "local")
        serve(self.frontend)
        manage("finish", success=False)
        self.assertFalse(receipt.exists())
        manage("rollback")
        self.assertEqual(os.readlink(self.frontend / "live"), ".")
        manage("unlock")
        ident = "b" * 32
        manage("prepare", "local")
        serve(self.frontend / "live")
        manage("finish")
        manage("rollback")
        self.assertEqual(os.readlink(self.frontend / "live"), "candidate-" + ident)
        manage("unlock")
        self.assertEqual(json.loads(receipt.read_text())["type"], "local")
        before = (self.frontend / "live/server.crt").read_bytes()
        self.run_init()
        self.assertEqual((self.frontend / "live/server.crt").read_bytes(), before)

        inputs = self.root / "input"
        inputs.mkdir()
        env["ODYSSEY_TLS_INPUT"] = str(inputs)
        (inputs / "cert.pem").write_bytes(before)
        (inputs / "ca.pem").write_bytes((self.ca / "ca.crt").read_bytes())
        (inputs / "key.pem").write_bytes((self.backend / "server.key").read_bytes())
        ident = "c" * 32
        manage("prepare", "custom", success=False)
        manage("rollback")
        manage("unlock")
        self.assertEqual((self.frontend / "live/server.crt").read_bytes(), before)
        (inputs / "key.pem").write_bytes((self.frontend / "live/server.key").read_bytes())
        ident = "d" * 32
        manage("prepare", "custom")
        serve(self.frontend / "live")
        manage("finish")
        manage("unlock")
        self.assertEqual(json.loads(receipt.read_text())["type"], "custom")

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="odyssey-init-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.ca, self.backend, self.frontend = (self.root / name for name in ("ca", "backend", "frontend"))
        self.data, self.keys = (self.root / name for name in ("data", "keys"))
        for directory in (self.ca, self.backend, self.frontend, self.data, self.keys):
            directory.mkdir(mode=0o755)
        self.env = dict(os.environ, ODYSSEY_TLS_CA_DIR=str(self.ca), ODYSSEY_TLS_BACKEND_DIR=str(self.backend),
                        ODYSSEY_TLS_FRONTEND_DIR=str(self.frontend), ODYSSEY_PUBLIC_HOST="localhost",
                        ODYSSEY_BACKEND_UID=str(os.getuid()), ODYSSEY_FRONTEND_UID=str(os.getuid()),
                        ODYSSEY_BACKEND_GID=str(os.getgid()), ODYSSEY_FRONTEND_GID=str(os.getgid()),
                        ODYSSEY_CONTAINER_UID=str(os.getuid()), ODYSSEY_CONTAINER_GID=str(os.getgid()),
                        ODYSSEY_DATA_DIR=str(self.data), ODYSSEY_KEY_FILE=str(self.keys / "owner.key"))

    def run_init(self, script="docker/tls-init.sh", success=True):
        result = subprocess.run(["sh", str(ROOT / script)], env=self.env, capture_output=True, timeout=90)
        self.assertEqual(result.returncode == 0, success, "неожиданный результат init (секреты скрыты)")
        self.assertNotIn(b"BEGIN PRIVATE KEY", result.stdout + result.stderr)
        return result

    def snapshot(self):
        return {str(p.relative_to(self.root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.root.rglob("*") if p.is_file()}

    def test_tls_initialization_and_restart_preserve_every_key(self):
        self.run_init()
        before = self.snapshot()
        self.run_init()
        self.assertEqual(before, self.snapshot())
        for directory in (self.ca, self.backend, self.frontend):
            self.assertEqual(directory.stat().st_mode & 0o777, 0o700)
        for key in (self.ca / "ca.key", self.backend / "server.key", self.frontend / "server.key"):
            self.assertEqual(key.stat().st_mode & 0o777, 0o600)

    def test_partial_state_is_never_overwritten(self):
        (self.ca / "ca.key").write_text("synthetic-partial-state")
        before = self.snapshot()
        self.run_init(success=False)
        self.assertEqual(before, self.snapshot())

    def test_changed_public_host_requires_explicit_certificate_rotation(self):
        self.run_init()
        before = self.snapshot()
        self.env["ODYSSEY_PUBLIC_HOST"] = "other.invalid"
        self.run_init(success=False)
        self.assertEqual(before, self.snapshot())

    def test_mismatched_key_is_rejected_without_replacement(self):
        self.run_init()
        (self.frontend / "server.key").write_bytes((self.backend / "server.key").read_bytes())
        before = self.snapshot()
        self.run_init(success=False)
        self.assertEqual(before, self.snapshot())

    def test_untrusted_ca_copy_is_rejected(self):
        self.run_init()
        (self.backend / "ca.crt").write_text("synthetic-invalid-ca")
        before = self.snapshot()
        self.run_init(success=False)
        self.assertEqual(before, self.snapshot())

    def test_symlink_is_not_followed(self):
        (self.ca / "ca.key").symlink_to(self.root / "outside")
        self.run_init(success=False)
        self.assertFalse((self.root / "outside").exists())

    def test_invalid_hostname_does_not_generate_keys(self):
        self.env["ODYSSEY_PUBLIC_HOST"] = "localhost,IP:192.0.2.1"
        self.run_init(success=False)
        self.assertEqual(self.snapshot(), {})

    def test_owner_volume_init_and_restart_preserve_profiles(self):
        self.run_init("backend/owner-storage-init.sh")
        (self.data / "owner.enc").write_bytes(b"synthetic-encrypted-profiles")
        (self.keys / "owner.key").write_bytes(b"synthetic-key")
        before = self.snapshot()
        self.run_init("backend/owner-storage-init.sh")
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.data.stat().st_mode & 0o777, 0o700)
        self.assertEqual(self.keys.stat().st_mode & 0o777, 0o700)

    def test_nonempty_unsafe_owner_volume_is_not_modified(self):
        (self.data / "owner.enc").write_bytes(b"synthetic-existing-profile")
        before = self.snapshot()
        self.run_init("backend/owner-storage-init.sh", success=False)
        self.assertEqual(before, self.snapshot())
        self.assertEqual(self.data.stat().st_mode & 0o777, 0o755)


if __name__ == "__main__":
    unittest.main()
