import React, { createContext, useContext, useState } from 'react';

interface InboxCountContextValue {
  inboxCount: number;
  setInboxCount: (n: number) => void;
}

const InboxCountContext = createContext<InboxCountContextValue>({
  inboxCount: 0,
  setInboxCount: () => {},
});

export function InboxCountProvider({ children }: { children: React.ReactNode }) {
  const [inboxCount, setInboxCount] = useState(0);
  return (
    <InboxCountContext.Provider value={{ inboxCount, setInboxCount }}>
      {children}
    </InboxCountContext.Provider>
  );
}

export function useInboxCount() {
  return useContext(InboxCountContext);
}
