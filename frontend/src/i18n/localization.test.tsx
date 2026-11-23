// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import i18n from './index';
import { serverMessage } from './serverMessage';
import OffsetResetWizard from '../pages/consumer-groups/components/OffsetResetWizard';
import en from '../locales/en/common.json';
import ru from '../locales/ru/common.json';

afterEach(async () => { cleanup(); await i18n.changeLanguage('ru'); });

it('переключает открытый мастер без потери шага и имени группы', async () => {
  await i18n.changeLanguage('ru');
  render(<OffsetResetWizard open group={{name:'Группа-А',state:'Stable',lag:0,members:0,coordinator:'0'}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', {name:'Далее'}));
  await act(async () => { await i18n.changeLanguage('en'); });
  expect(screen.getByText('Latest — end of topic')).toBeTruthy();
  expect(screen.getByRole('button', {name:'Next'})).toBeTruthy();
  expect(document.documentElement.lang).toBe('en');
});

it('сохраняет технические сведения при переводе ошибки backend', async () => {
  await i18n.changeLanguage('en');
  expect(serverMessage('Ошибка подключения к Kafka: topic-Тест')).toBe('Kafka connection failed: topic-Тест');
  expect(serverMessage('topic-Тест')).toBe('topic-Тест');
  expect(Object.keys(en.interface).sort()).toEqual(Object.keys(ru.interface).sort());
  expect(Object.keys(en.clusterEvent).sort()).toEqual(Object.keys(ru.clusterEvent).sort());
});
