// Tiny app state: profile + a version counter that screens bump to re-read
// SQLite. No external state lib needed at this size.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { getProfile, type Profile } from './db';

type Store = {
  profile: Profile;
  refresh: () => void;
  version: number;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);
  const [profile, setProfile] = useState<Profile>(() => getProfile());

  const refresh = useCallback(() => {
    setProfile(getProfile());
    setVersion(v => v + 1);
  }, []);

  const value = useMemo(() => ({ profile, refresh, version }), [profile, refresh, version]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside provider');
  return s;
}
