package main

import "strings"

// Удаление/смена профиля прекращает старый polling. Уже выполняющаяся операция
// ограничена существующими таймаутами и не публикуется под новой ревизией.
func stopOldProfileCollectors(store *ownerStore, id string) {
	prefix := id + ":"
	// Каждая карта сверяется с текущим store, а не с ревизией завершившегося PUT.
	// Поздний cleanup старого PUT не должен остановить новый сборщик.
	current := func() string {
		p, ok := store.profile(id)
		if !ok {
			return ""
		}
		return profileKey(p)
	}
	collectorMu.Lock()
	keep := current()
	for key, c := range collectorByBootstrap {
		if strings.HasPrefix(key, prefix) && key != keep {
			c.Stop()
			delete(collectorByBootstrap, key)
		}
	}
	collectorMu.Unlock()
	topicsCollectorMu.Lock()
	keep = current()
	for key, c := range topicsCollectorByBootstrap {
		if strings.HasPrefix(key, prefix) && key != keep {
			c.Stop()
			delete(topicsCollectorByBootstrap, key)
		}
	}
	topicsCollectorMu.Unlock()
	lagCollectorMu.Lock()
	keep = current()
	for key, c := range lagCollectorByBootstrap {
		if strings.HasPrefix(key, prefix) && key != keep {
			c.Stop()
			delete(lagCollectorByBootstrap, key)
		}
	}
	lagCollectorMu.Unlock()
	eventCollectorMu.Lock()
	keep = current()
	for key, c := range eventCollectorByBootstrap {
		if strings.HasPrefix(key, prefix) && key != keep {
			c.Stop()
			delete(eventCollectorByBootstrap, key)
		}
	}
	eventCollectorMu.Unlock()
	consumerLagStateMu.Lock()
	keep = current()
	for key := range consumerLagState {
		if strings.HasPrefix(key, prefix) && key != keep {
			delete(consumerLagState, key)
		}
	}
	consumerLagStateMu.Unlock()
}
