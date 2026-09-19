import { useEffect, useRef } from "react";
import { mountGame } from "../game";

// Placeholder: the UI owner replaces this with real screens.
export function App() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = mountGame(ref.current!);
    return () => handle.destroy();
  }, []);

  return <div ref={ref} style={{ width: "100vw", height: "100vh" }} />;
}
