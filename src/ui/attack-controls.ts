import type { FilterMode } from '../lib/effectiveness.ts';

export function setupAttackControls(onChange: () => void) {
  const root = document.querySelector<HTMLElement>('.offense-section')!;
  const slots = ['fast', 'charged'] as const;
  let doubleEffectiveAvailable = false;

  function selected(slot: typeof slots[number]): FilterMode {
    return root.querySelector<HTMLInputElement>(`input[name="${slot}"]:checked`)!.value as FilterMode;
  }

  function render() {
    for (const slot of slots) {
      const refinement = root.querySelector<HTMLElement>(`#${slot}-refinement`)!;
      const checkbox = root.querySelector<HTMLInputElement>(`#${slot}-double-effective`)!;
      refinement.hidden = !doubleEffectiveAvailable || selected(slot) !== 'super-effective';
      if (refinement.hidden) checkbox.checked = false;
    }
  }

  root.addEventListener('change', () => { render(); onChange(); });
  render();
  return {
    setDoubleEffectiveAvailable(available: boolean) {
      doubleEffectiveAvailable = available;
      render();
    },
    read(slot: typeof slots[number]): FilterMode {
      return selected(slot) === 'super-effective' && root.querySelector<HTMLInputElement>(`#${slot}-double-effective`)!.checked ?
        'double-super-effective' : selected(slot);
    },
    reset() {
      for (const slot of slots) {
        root.querySelector<HTMLInputElement>(`input[name="${slot}"][value="super-effective"]`)!.checked = true;
        root.querySelector<HTMLInputElement>(`#${slot}-double-effective`)!.checked = false;
      }
      render();
    },
  };
}
