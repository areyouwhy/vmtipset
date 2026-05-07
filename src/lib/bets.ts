/**
 * Pure scoring for daily / round bets (game mode B).
 *
 * For now, "correct" = exact match for both player_ref and numeric. Numeric
 * bets do NOT support tolerance/closest-wins yet (per BACKLOG default).
 */

import type { BetAnswerType } from "@/db/schema";

export type BetForScoring = {
  id: string;
  answerType: BetAnswerType;
  pointsValue: number;
  correctAnswerPlayerId: string | null;
  correctAnswerNumeric: number | null;
};

export type BetAnswerForScoring = {
  id: string;
  teamId: string;
  answerPlayerId: string | null;
  answerNumeric: number | null;
};

export type BetScoreLine = {
  answerId: string;
  teamId: string;
  pointsAwarded: number;
  isCorrect: boolean;
};

export function scoreBet(
  bet: BetForScoring,
  answers: BetAnswerForScoring[],
): BetScoreLine[] {
  return answers.map((a) => {
    const isCorrect = isAnswerCorrect(bet, a);
    return {
      answerId: a.id,
      teamId: a.teamId,
      pointsAwarded: isCorrect ? bet.pointsValue : 0,
      isCorrect,
    };
  });
}

export function isAnswerCorrect(
  bet: BetForScoring,
  answer: BetAnswerForScoring,
): boolean {
  if (bet.answerType === "player_ref") {
    return (
      bet.correctAnswerPlayerId !== null &&
      answer.answerPlayerId !== null &&
      bet.correctAnswerPlayerId === answer.answerPlayerId
    );
  }
  return (
    bet.correctAnswerNumeric !== null &&
    answer.answerNumeric !== null &&
    bet.correctAnswerNumeric === answer.answerNumeric
  );
}
