let active = false;

export function setBackGuard(value: boolean) {
  active = value;
}

export function isBackGuarded(): boolean {
  return active;
}
