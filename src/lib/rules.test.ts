import { describe, it, expect } from "vitest";
import {
  currentRules,
  formationToString,
  isFormationLegal,
  maxPositionTotal,
  minPositionTotal,
} from "./rules";

describe("ruleset sanity", () => {
  it("position minimums fit within squad size", () => {
    expect(minPositionTotal(currentRules)).toBeLessThanOrEqual(
      currentRules.squadSize,
    );
  });

  it("position maximums can fill the squad", () => {
    expect(maxPositionTotal(currentRules)).toBeGreaterThanOrEqual(
      currentRules.squadSize,
    );
  });

  it("every legal formation totals 10 outfield players (squad - 1 GK)", () => {
    const expected = currentRules.squadSize - 1;
    for (const f of currentRules.legalFormations) {
      expect(
        f.def + f.mid + f.fwd,
        `formation ${formationToString(f)} should total ${expected}`,
      ).toBe(expected);
    }
  });

  it("every legal formation respects the position min/max", () => {
    const { DEF, MID, FWD } = currentRules.positions;
    for (const f of currentRules.legalFormations) {
      expect(f.def, formationToString(f)).toBeGreaterThanOrEqual(DEF.min);
      expect(f.def, formationToString(f)).toBeLessThanOrEqual(DEF.max);
      expect(f.mid, formationToString(f)).toBeGreaterThanOrEqual(MID.min);
      expect(f.mid, formationToString(f)).toBeLessThanOrEqual(MID.max);
      expect(f.fwd, formationToString(f)).toBeGreaterThanOrEqual(FWD.min);
      expect(f.fwd, formationToString(f)).toBeLessThanOrEqual(FWD.max);
    }
  });

  it("legal formations include common picks", () => {
    expect(
      isFormationLegal({ def: 4, mid: 3, fwd: 3 }, currentRules),
    ).toBe(true);
    expect(
      isFormationLegal({ def: 4, mid: 4, fwd: 2 }, currentRules),
    ).toBe(true);
  });

  it("rejects invalid formations", () => {
    expect(
      isFormationLegal({ def: 6, mid: 3, fwd: 1 }, currentRules),
    ).toBe(false);
    expect(
      isFormationLegal({ def: 2, mid: 5, fwd: 3 }, currentRules),
    ).toBe(false);
  });

  it("captain multiplier is at least 1 (otherwise captain is a penalty)", () => {
    expect(currentRules.captainMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("percentage rules are within sane bounds", () => {
    expect(currentRules.bankInterestPctPerRound).toBeGreaterThanOrEqual(0);
    expect(currentRules.bankInterestPctPerRound).toBeLessThan(1);
    expect(currentRules.transferFeePct).toBeGreaterThanOrEqual(0);
    expect(currentRules.transferFeePct).toBeLessThan(1);
  });

  it("formation strings are stable", () => {
    expect(formationToString({ def: 4, mid: 3, fwd: 3 })).toBe("4-3-3");
  });
});
