import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CuriosityQuestion {
  id: string;
  question: string;
  context: string | null;
  curiosity_score: number;
}

export function useCuriosityQuestions(userId: string | undefined) {
  const [questions, setQuestions] = useState<CuriosityQuestion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async () => {
    if (!userId) return;
    setLoading(true);
    const { data } = await supabase
      .from("curiosity_questions")
      .select("id, question, context, curiosity_score")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("curiosity_score", { ascending: false })
      .limit(5);

    setQuestions((data as CuriosityQuestion[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchQuestions();
  }, [userId]);

  const dismissQuestion = async (id: string) => {
    await supabase
      .from("curiosity_questions")
      .update({ status: "dismissed" })
      .eq("id", id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  const dismissAll = async () => {
    const ids = questions.map((q) => q.id);
    for (const id of ids) {
      await supabase
        .from("curiosity_questions")
        .update({ status: "dismissed" })
        .eq("id", id);
    }
    setQuestions([]);
  };

  const markShown = async (ids: string[]) => {
    for (const id of ids) {
      await supabase
        .from("curiosity_questions")
        .update({ status: "shown", shown_at: new Date().toISOString() })
        .eq("id", id);
    }
  };

  const markAnswered = async (id: string) => {
    await supabase
      .from("curiosity_questions")
      .update({ status: "answered", answered_at: new Date().toISOString() })
      .eq("id", id);
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  return { questions, loading, dismissQuestion, dismissAll, markShown, markAnswered, refetch: fetchQuestions };
}
