/**
 * App settings (theme, language) plus a tiny modal controller.
 *
 * The legacy app kept these in Redux (`settingState`, `modalState`); Zustand
 * replaces both without the action/reducer boilerplate.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeScheme = 'light' | 'dark';

export interface SettingsState {
  theme: ThemeScheme;
  language: string;
}

export interface SettingsActions {
  setTheme(theme: ThemeScheme): void;
  toggleTheme(): void;
}

export const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      theme: 'light',
      language: 'zh_CN',

      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
    }),
    {
      name: 'settingState',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

/** Which bottom sheet, if any, is currently open. */
export type ModalKind =
  | { kind: 'none' }
  | { kind: 'player' }
  | { kind: 'addToPlaylist'; trackId: string }
  | { kind: 'trackActions'; trackId: string }
  | { kind: 'playlistActions'; playlistId: string };

export interface ModalState {
  modal: ModalKind;
}

export interface ModalActions {
  openModal(modal: ModalKind): void;
  closeModal(): void;
}

export const useModalStore = create<ModalState & ModalActions>()((set) => ({
  modal: { kind: 'none' },

  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: { kind: 'none' } }),
}));
