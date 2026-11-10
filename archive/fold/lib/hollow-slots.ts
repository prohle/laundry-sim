// Slot order for Hollow mode (task 9.5). Pure constants, safe for the browser bundle.
/** The nth photograph added is looked at from this angle, degrees about the vertical axis. */
export const SLOT_ANGLES = [0, 90, 180, 270] as const;
export const SLOT_NAMES = ["Front", "Right", "Back", "Left"] as const;
export const MIN_HOLLOW_VIEWS = 2;
export const MAX_HOLLOW_VIEWS = 4;
