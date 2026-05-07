import { describe, expect, it } from "vitest";
import { isAnswerCorrect, scoreBet, type BetForScoring } from "./bets";

const playerBet: BetForScoring = {
  id: "bet-1",
  answerType: "player_ref",
  pointsValue: 100,
  correctAnswerPlayerId: "player-x",
  correctAnswerNumeric: null,
};

const numericBet: BetForScoring = {
  id: "bet-2",
  answerType: "numeric",
  pointsValue: 50,
  correctAnswerPlayerId: null,
  correctAnswerNumeric: 3,
};

describe("scoreBet", () => {
  it("awards points for an exact player match", () => {
    const out = scoreBet(playerBet, [
      { id: "a1", teamId: "t1", answerPlayerId: "player-x", answerNumeric: null },
      { id: "a2", teamId: "t2", answerPlayerId: "player-y", answerNumeric: null },
    ]);
    expect(out[0].pointsAwarded).toBe(100);
    expect(out[0].isCorrect).toBe(true);
    expect(out[1].pointsAwarded).toBe(0);
    expect(out[1].isCorrect).toBe(false);
  });

  it("awards points for an exact numeric match", () => {
    const out = scoreBet(numericBet, [
      { id: "a1", teamId: "t1", answerPlayerId: null, answerNumeric: 3 },
      { id: "a2", teamId: "t2", answerPlayerId: null, answerNumeric: 4 },
      { id: "a3", teamId: "t3", answerPlayerId: null, answerNumeric: 0 },
    ]);
    expect(out[0].pointsAwarded).toBe(50);
    expect(out[1].pointsAwarded).toBe(0);
    expect(out[2].pointsAwarded).toBe(0);
  });

  it("does not award when correct answer is null (admin hasn't set it yet)", () => {
    const empty: BetForScoring = {
      ...playerBet,
      correctAnswerPlayerId: null,
    };
    const out = scoreBet(empty, [
      { id: "a1", teamId: "t1", answerPlayerId: "player-x", answerNumeric: null },
    ]);
    expect(out[0].pointsAwarded).toBe(0);
  });

  it("does not award when user's answer is null", () => {
    const out = scoreBet(playerBet, [
      { id: "a1", teamId: "t1", answerPlayerId: null, answerNumeric: null },
    ]);
    expect(out[0].pointsAwarded).toBe(0);
  });

  it("numeric bet ignores player ref on the answer side", () => {
    expect(
      isAnswerCorrect(numericBet, {
        id: "a1",
        teamId: "t1",
        answerPlayerId: "player-x",
        answerNumeric: null,
      }),
    ).toBe(false);
  });

  it("player_ref bet ignores numeric on the answer side", () => {
    expect(
      isAnswerCorrect(playerBet, {
        id: "a1",
        teamId: "t1",
        answerPlayerId: null,
        answerNumeric: 3,
      }),
    ).toBe(false);
  });

  it("re-running scoreBet on the same inputs gives identical output", () => {
    const inputs = [
      { id: "a1", teamId: "t1", answerPlayerId: "player-x", answerNumeric: null },
      { id: "a2", teamId: "t2", answerPlayerId: "player-y", answerNumeric: null },
    ];
    const a = scoreBet(playerBet, inputs);
    const b = scoreBet(playerBet, inputs);
    expect(b).toEqual(a);
  });
});
