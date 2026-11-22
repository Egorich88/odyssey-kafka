package main

import (
	"encoding/json"
	"net/http"
	"strconv"
)

type kafkaAdminAction string

const (
	adminCreateTopic      kafkaAdminAction = "topics.create"
	adminDeleteTopic      kafkaAdminAction = "topics.delete"
	adminAlterTopicConfig kafkaAdminAction = "topics.config.update"
	adminManageACL        kafkaAdminAction = "acl.manage"
)

// Расширение политики возможно только доверенным серверным кодом. Будущая
// реализация обязана проверять подлинную личность владельца и право на действие
// в выбранном кластере. Флаг окружения, bootstrap и клиентские заголовки
// сами по себе не подтверждают эти полномочия.
type kafkaAdminAuthorizer interface {
	Allowed(*http.Request, kafkaAdminAction) bool
}

type denyKafkaAdministration struct{}

func (denyKafkaAdministration) Allowed(*http.Request, kafkaAdminAction) bool { return false }

// Публичный Core закрыт для записи до реализации безопасной авторизации.
// Enterprise RBAC здесь не реализуется и автоматически не подключается.
var kafkaAdminPolicy kafkaAdminAuthorizer = denyKafkaAdministration{}

type ownerKafkaAdministration struct {
	auth  *ownerAuth
	store *ownerStore
}

func (p ownerKafkaAdministration) Allowed(r *http.Request, action kafkaAdminAction) bool {
	if p.auth == nil || p.store == nil || !p.auth.allowed(r, r.Method != http.MethodGet && r.Method != http.MethodHead) {
		return false
	}
	if action != adminCreateTopic && action != adminDeleteTopic && action != adminAlterTopicConfig {
		return false
	}
	id := r.Header.Get("X-Kafka-Profile-ID")
	profile, ok := p.store.profile(id)
	return ok && !isGSSAPIProfile(profile.Config) && getProfileKeyFromRequest(r) == profileKey(profile) && r.Header.Get("X-Kafka-Profile-Revision") == strconv.FormatUint(profile.Revision, 10)
}

func kafkaAdminAllowed(r *http.Request, action kafkaAdminAction) bool {
	return kafkaAdminPolicy != nil && kafkaAdminPolicy.Allowed(r, action)
}

func authorizeKafkaAdministration(w http.ResponseWriter, r *http.Request, action kafkaAdminAction) bool {
	if kafkaAdminAllowed(r, action) {
		return true
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	sendJSONError(w, "Административные операции Kafka запрещены: требуется серверная авторизация владельца.", http.StatusForbidden)
	return false
}

func kafkaCapabilitiesHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		sendJSONError(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	// Только решение той же политики, без подключения к Kafka и чтения секретов.
	_ = json.NewEncoder(w).Encode(map[string]any{"kafkaAdmin": map[string]bool{
		"createTopic":      kafkaAdminAllowed(r, adminCreateTopic),
		"deleteTopic":      kafkaAdminAllowed(r, adminDeleteTopic),
		"alterTopicConfig": kafkaAdminAllowed(r, adminAlterTopicConfig),
		// ACL API отсутствует: право не означает наличие реализованной функции.
		"manageAcl": false,
	}})
}
