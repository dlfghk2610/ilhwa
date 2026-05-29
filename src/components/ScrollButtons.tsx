import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export const ScrollButtons = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      setShow(doc.scrollHeight - doc.clientHeight > 200);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col gap-2">
      <Button
        size="icon"
        variant="secondary"
        className="rounded-full shadow-lg h-10 w-10"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
      >
        <ChevronUp className="h-5 w-5" />
      </Button>
      <Button
        size="icon"
        variant="secondary"
        className="rounded-full shadow-lg h-10 w-10"
        onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" })}
        aria-label="맨 아래로"
      >
        <ChevronDown className="h-5 w-5" />
      </Button>
    </div>
  );
};
