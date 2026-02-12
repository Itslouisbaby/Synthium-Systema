import { test, expect } from 'vitest';
import { ActionClass, Autonomy } from '../src/index.js';

test('debug action classes', () => {
  console.log('ActionClass:', ActionClass);
  console.log('Irreversible value:', ActionClass.Irreversible);
  console.log('Type:', typeof ActionClass.Irreversible);
  expect(ActionClass.Irreversible).toBe('irreversible');
});

test('debug autonomy', () => {
  console.log('Autonomy:', Autonomy);
  expect(Autonomy.Level1).toBe(1);
  expect(Autonomy.Level2).toBe(2);
  expect(Autonomy.Level3).toBe(3);
});