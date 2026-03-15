import { useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

const EXIT_DURATION = 250;

export function usePageNavigate() {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const navigateTo = useCallback(
    (path: string, delay = 0) => {
      // Optional extra delay (e.g. waiting for dialog close animation)
      const start = () => {
        setExiting(true);
        timeoutRef.current = setTimeout(() => {
          navigate(path);
        }, EXIT_DURATION);
      };

      if (delay > 0) {
        setTimeout(start, delay);
      } else {
        start();
      }
    },
    [navigate]
  );

  return { exiting, navigateTo };
}
