"""Локальная активация HTTPS. Секреты передаются только через файловые монтирования."""
import argparse
import ipaddress
import json
from pathlib import Path
import re
import subprocess
import time
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]


def activate(project, mode, cert=None, key=None, ca=None, renew=False, recover=False):
    compose = ["docker", "compose", "-p", project, "-f", str(ROOT / "docker-compose.yml")]

    def run(args, **kwargs):
        return subprocess.run(compose + args, cwd=ROOT, check=True, **kwargs)

    if recover:
        # Запускается оператором после завершения прерванного CLI.
        base = ["run", "--rm", "--no-deps", "-T", "https-manager"]
        ident = run(base + ["pending"], capture_output=True, text=True).stdout.strip()
        if not ident:
            return
        if not re.fullmatch("[a-f0-9]{32}", ident):
            raise ValueError("Invalid transaction")
        receipt = run(["run", "--rm", "-T", "--no-deps", "--entrypoint", "sh", "https-manager", "-ec",
                       "if test -f /state/public/active.json; then cat /state/public/active.json; else echo '{}'; fi"],
                      capture_output=True, text=True)
        if json.loads(receipt.stdout).get("generation") != ident:
            run(base + ["rollback", ident])
            run(["up", "-d", "frontend-service"])
            run(["exec", "-T", "frontend-service", "nginx", "-t"])
            run(["exec", "-T", "frontend-service", "nginx", "-s", "reload"])
        run(base + ["unlock", ident])
        return

    origin = run(["exec", "-T", "frontend-service", "printenv", "ODYSSEY_PUBLIC_ORIGIN"],
                 capture_output=True, text=True).stdout.strip()
    url = urlsplit(origin)
    host = url.hostname or ""
    if (url.scheme != "https" or url.username or url.password or url.path or url.query or url.fragment
            or not re.fullmatch(r"[a-zA-Z0-9.-]+", host)):
        raise ValueError("Invalid HTTPS origin")
    if mode == "auto" and host != "localhost":
        if "." not in host or host.endswith(".local"):
            raise ValueError("A public DNS name is required")
        try:
            ipaddress.ip_address(host)
        except ValueError:
            pass
        else:
            raise ValueError("A public DNS name is required")
        # Certbot проверяет владение доменом по HTTP-01; ключ остаётся на сервере.
        command = ["certbot", "certonly", "--standalone", "--preferred-challenges", "http",
                   "--cert-name", host, "-d", host]
        if renew:
            command.append("--force-renewal")
        subprocess.run(command, check=True)
        cert = Path("/etc/letsencrypt/live") / host / "fullchain.pem"
        key = cert.parent / "privkey.pem"
        kind = "letsencrypt"
    else:
        kind = "local" if mode == "auto" else "custom"
    mounts = []
    if kind != "local":
        if not cert or not key:
            raise ValueError("Use --cert FULLCHAIN.pem --key PRIVATE.pem")
        for source, name in [(cert, "cert"), (key, "key"), (ca, "ca")]:
            if source is None:
                continue
            file = Path(source).resolve(strict=True)
            if not file.is_file() or file.stat().st_size > 2**20:
                raise ValueError("Invalid PEM file")
            mounts += ["-v", f"{file}:/input/{name}.pem:ro"]
    ident = uuid4().hex

    def manage(action, *args):
        run(["run", "--rm", "--no-deps", "-T", *mounts, "https-manager", action, ident, *args])

    def reload():
        run(["exec", "-T", "frontend-service", "nginx", "-t"])
        run(["exec", "-T", "frontend-service", "nginx", "-s", "reload"])

    try:
        manage("prepare", kind)
        reload()
        for attempt in range(4):
            try:
                manage("finish")
                break
            except subprocess.CalledProcessError:
                if attempt == 3:
                    raise
                time.sleep(1)
    except BaseException:
        manage("rollback")
        reload()
        manage("unlock")
        raise
    manage("unlock")
    print(origin, flush=True)
    exists = subprocess.run(compose + ["exec", "-T", "backend-service", "test", "-s", "/var/lib/odyssey/data/owner.enc"], cwd=ROOT)
    if exists.returncode == 1:
        run(["run", "--rm", "owner-init"])
    else:
        exists.check_returncode()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", required=True)
    parser.add_argument("--mode", choices=["auto", "custom"], default="auto")
    parser.add_argument("--cert", type=Path)
    parser.add_argument("--key", type=Path)
    parser.add_argument("--ca", type=Path)
    parser.add_argument("--renew", action="store_true")
    parser.add_argument("--recover", action="store_true")
    args = parser.parse_args()
    activate(args.project, args.mode, args.cert, args.key, args.ca, args.renew, args.recover)
