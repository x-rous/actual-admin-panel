import { useStagedStore } from "./staged";
import type { Account } from "@/types/entities";

// Reset the store to a known empty state before each test to prevent leakage.
beforeEach(() => {
  useStagedStore.setState({
    accounts: {},
    payees: {},
    categoryGroups: {},
    categories: {},
    rules: {},
    schedules: {},
    undoStack: [],
    redoStack: [],
    mergeDependencies: {},
  });
});

const account = (id: string, name: string, overrides: Partial<Account> = {}): Account => ({
  id,
  name,
  offBudget: false,
  closed: false,
  ...overrides,
});

// ─── stageNew ─────────────────────────────────────────────────────────────────

describe("stageNew", () => {
  it("adds the entity with isNew=true", () => {
    const { stageNew } = useStagedStore.getState();
    stageNew("accounts", account("a1", "Checking"));

    const { accounts } = useStagedStore.getState();
    expect(accounts["a1"]).toBeDefined();
    expect(accounts["a1"].isNew).toBe(true);
    expect(accounts["a1"].isUpdated).toBe(false);
    expect(accounts["a1"].isDeleted).toBe(false);
    expect(accounts["a1"].entity.name).toBe("Checking");
  });

  it("sets original to null for new entities", () => {
    const { stageNew } = useStagedStore.getState();
    stageNew("accounts", account("a1", "Checking"));

    expect(useStagedStore.getState().accounts["a1"].original).toBeNull();
  });
});

// ─── stageUpdate ──────────────────────────────────────────────────────────────

describe("stageUpdate", () => {
  it("updates the entity and marks it as isUpdated", () => {
    const { stageNew, stageUpdate, loadAccounts } = useStagedStore.getState();

    // Load a server account first so it is not isNew
    loadAccounts([account("a1", "Checking")]);
    stageUpdate("accounts", "a1", { name: "Main Checking" });

    const { accounts } = useStagedStore.getState();
    expect(accounts["a1"].entity.name).toBe("Main Checking");
    expect(accounts["a1"].isUpdated).toBe(true);
    expect(accounts["a1"].isNew).toBe(false);
  });

  it("does NOT set isUpdated on a new (unstaged) entity", () => {
    const { stageNew, stageUpdate } = useStagedStore.getState();
    stageNew("accounts", account("a1", "Checking"));
    stageUpdate("accounts", "a1", { name: "Updated" });

    const { accounts } = useStagedStore.getState();
    // isNew entities stay isNew, not isUpdated
    expect(accounts["a1"].isNew).toBe(true);
    expect(accounts["a1"].isUpdated).toBe(false);
    expect(accounts["a1"].entity.name).toBe("Updated");
  });

  it("is a no-op for non-existent entity IDs", () => {
    const { stageUpdate } = useStagedStore.getState();
    stageUpdate("accounts", "nonexistent", { name: "Ghost" });

    expect(Object.keys(useStagedStore.getState().accounts)).toHaveLength(0);
  });
});

// ─── stageDelete ──────────────────────────────────────────────────────────────

describe("stageDelete", () => {
  it("marks a server entity as isDeleted", () => {
    const { loadAccounts, stageDelete } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);
    stageDelete("accounts", "a1");

    expect(useStagedStore.getState().accounts["a1"].isDeleted).toBe(true);
  });

  it("completely removes a new entity (never committed to server)", () => {
    const { stageNew, stageDelete } = useStagedStore.getState();
    stageNew("accounts", account("a1", "Checking"));
    stageDelete("accounts", "a1");

    expect(useStagedStore.getState().accounts["a1"]).toBeUndefined();
  });
});

// ─── revertEntity ─────────────────────────────────────────────────────────────

describe("revertEntity", () => {
  it("restores entity to its original value and clears isUpdated", () => {
    const { loadAccounts, stageUpdate, revertEntity } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);
    stageUpdate("accounts", "a1", { name: "EDITED" });
    revertEntity("accounts", "a1");

    const entry = useStagedStore.getState().accounts["a1"];
    expect(entry.entity.name).toBe("Checking");
    expect(entry.isUpdated).toBe(false);
    expect(entry.isDeleted).toBe(false);
  });

  it("clears saveError on revert", () => {
    const { loadAccounts, setSaveErrors, revertEntity } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);
    setSaveErrors("accounts", { a1: "Something went wrong" });
    revertEntity("accounts", "a1");

    expect(useStagedStore.getState().accounts["a1"].saveError).toBeUndefined();
  });
});

// ─── loadAccounts (preserve-isNew behaviour) ──────────────────────────────────

describe("loadAccounts", () => {
  it("replaces server entities with fresh data", () => {
    const { loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Old Name")]);
    loadAccounts([account("a1", "New Name")]);

    expect(useStagedStore.getState().accounts["a1"].entity.name).toBe("New Name");
  });

  it("preserves isNew entities not present in server response", () => {
    const { stageNew, loadAccounts } = useStagedStore.getState();
    stageNew("accounts", account("new-id", "Unsaved"));
    loadAccounts([account("a1", "Server Account")]);

    const { accounts } = useStagedStore.getState();
    expect(accounts["new-id"]).toBeDefined();
    expect(accounts["new-id"].isNew).toBe(true);
    expect(accounts["a1"]).toBeDefined();
  });

  it("does NOT preserve deleted-or-updated server entities removed from the server response", () => {
    // An entity that existed on the server but is now absent from the response
    // should not be preserved — the server has removed it.
    const { loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking"), account("a2", "Savings")]);
    loadAccounts([account("a1", "Checking")]); // a2 no longer returned

    expect(useStagedStore.getState().accounts["a2"]).toBeUndefined();
  });
});

// ─── pushUndo / undo / redo ───────────────────────────────────────────────────

describe("pushUndo / undo / redo", () => {
  it("undo restores previous state", () => {
    const { stageNew, pushUndo, undo, loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);

    pushUndo();
    stageNew("accounts", account("a2", "Savings"));

    expect(Object.keys(useStagedStore.getState().accounts)).toHaveLength(2);

    undo();
    expect(Object.keys(useStagedStore.getState().accounts)).toHaveLength(1);
    expect(useStagedStore.getState().accounts["a2"]).toBeUndefined();
  });

  it("redo re-applies the undone state", () => {
    const { stageNew, pushUndo, undo, redo, loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);

    pushUndo();
    stageNew("accounts", account("a2", "Savings"));

    undo();
    redo();

    expect(useStagedStore.getState().accounts["a2"]).toBeDefined();
  });

  it("pushUndo clears the redo stack", () => {
    const { stageNew, pushUndo, undo, loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);

    pushUndo();
    stageNew("accounts", account("a2", "Savings"));
    undo();

    // Now redo stack has one entry. A new pushUndo should clear it.
    pushUndo();
    expect(useStagedStore.getState().redoStack).toHaveLength(0);
  });

  it("undo is a no-op when the stack is empty", () => {
    const { undo, loadAccounts } = useStagedStore.getState();
    loadAccounts([account("a1", "Checking")]);
    undo(); // should not throw

    expect(useStagedStore.getState().accounts["a1"]).toBeDefined();
  });

  it("redo is a no-op when the redo stack is empty", () => {
    const { redo } = useStagedStore.getState();
    redo(); // should not throw
  });
});

// ─── undo: orphaned merge dependency cleanup ──────────────────────────────────

describe("undo — merge dependency cleanup", () => {
  it("removes mergeDependency entries whose newRuleId no longer exists after undo", () => {
    const { stageNew, pushUndo, undo, setMergeDependency } = useStagedStore.getState();

    pushUndo(); // checkpoint before the rule is added
    stageNew("rules", {
      id: "new-rule",
      stage: "default",
      conditionsOp: "and",
      conditions: [],
      actions: [],
    });
    setMergeDependency("new-rule", ["old-rule-1"]);

    expect(useStagedStore.getState().mergeDependencies["new-rule"]).toBeDefined();

    undo(); // new-rule is removed from state

    expect(useStagedStore.getState().mergeDependencies["new-rule"]).toBeUndefined();
  });

  it("preserves mergeDependency entries that still exist after undo", () => {
    const { stageNew, pushUndo, undo, setMergeDependency, loadAccounts } = useStagedStore.getState();

    // Load something first so there's a non-empty state to undo to
    loadAccounts([account("a1", "Checking")]);
    stageNew("rules", {
      id: "rule-A",
      stage: "default",
      conditionsOp: "and",
      conditions: [],
      actions: [],
    });
    setMergeDependency("rule-A", ["old-1"]);

    pushUndo();
    loadAccounts([account("a1", "Checking"), account("a2", "Savings")]);

    undo(); // reverts the second loadAccounts, but rule-A was already there before the checkpoint

    // rule-A still exists in the reverted state (it was added before pushUndo)
    expect(useStagedStore.getState().mergeDependencies["rule-A"]).toBeDefined();
  });
});

// ─── discardAll ───────────────────────────────────────────────────────────────

describe("discardAll", () => {
  it("clears all entity maps and stacks", () => {
    const { stageNew, pushUndo, discardAll } = useStagedStore.getState();
    stageNew("accounts", account("a1", "Checking"));
    pushUndo();

    discardAll();

    const state = useStagedStore.getState();
    expect(Object.keys(state.accounts)).toHaveLength(0);
    expect(state.undoStack).toHaveLength(0);
    expect(state.redoStack).toHaveLength(0);
    expect(state.mergeDependencies).toEqual({});
  });
});
