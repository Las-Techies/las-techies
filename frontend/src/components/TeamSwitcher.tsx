import { useEffect, useRef, useState } from "react";
import { activateTeam, apiFetch, listManagedTeams, type ManagedTeam } from "../api/client";
import { supabase } from "../lib/supabaseClient";
import { CheckPlain, ChevronDown, ChevronUp, UsersIcon } from "./icons";

/**
 * Header control for managers who own more than one team. Lists the teams the
 * manager owns, highlights the active one, and lets them switch (which changes
 * what the whole dashboard shows — the active team is a session-wide concept,
 * carried in the JWT) or create a brand-new team.
 *
 * Switching writes the active team to the DB (the source of truth), so it takes
 * effect on the next request with no session refresh — that's what keeps a
 * switch snappy. Creating a team also stamps JWT metadata, so it still refreshes
 * the session. Both then call onTeamChanged with the now-active team id so the
 * dashboard can reload (and mark the right team) immediately. Rendered as a
 * no-op placeholder while the owned-teams list is still loading so the header
 * doesn't jump.
 */
function TeamSwitcher({
  activeTeamId,
  activeTeamName,
  onTeamChanged,
}: {
  // The manager's currently active team id (from the dashboard payload), used
  // to mark the active row. Null until the dashboard knows it.
  activeTeamId: number | null;
  // The active team's name, straight from the dashboard payload. Lets the
  // trigger show the real team name on first paint instead of waiting for the
  // owned-teams list (loaded separately below) to resolve — otherwise the
  // label flashes a placeholder for a beat before the name appears.
  activeTeamName: string | null;
  // Called after the active team changes (switch or create), with the id of the
  // now-active team — the dashboard reloads its data (and marks that team) in
  // response.
  onTeamChanged: (teamId: number) => void;
}) {
  const [teams, setTeams] = useState<ManagedTeam[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  // Inline "create new team" form inside the dropdown.
  const [isCreating, setIsCreating] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  // Load the owned-teams list once on mount. A backfill on the backend ensures
  // even a pre-existing manager's current team shows up here.
  useEffect(() => {
    let cancelled = false;
    listManagedTeams()
      .then((result) => {
        if (!cancelled) setTeams(result);
      })
      .catch(() => {
        // Non-fatal: if the list can't load the manager just doesn't get a
        // switcher this session; the dashboard still works on their active team.
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // The owned-teams match is keyed on activeTeamId, so it's always consistent
  // with the active team — including right after an optimistic switch, when
  // activeTeamId has already changed but the dashboard hasn't refetched a fresh
  // activeTeamName yet. Prefer it, then fall back to the payload's name (correct
  // on first paint, before the teams list has loaded), then a neutral
  // placeholder only if we have neither.
  const activeTeam = teams.find((team) => team.id === activeTeamId) ?? null;
  const activeLabel = activeTeam?.name ?? activeTeamName ?? "Your team";

  async function handleSwitch(teamId: number) {
    if (teamId === activeTeamId || isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      await activateTeam(teamId);
      // No session refresh: the switch lives in the DB now, so the next
      // dashboard request already sees the new active team.
      setIsOpen(false);
      onTeamChanged(teamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't switch teams. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreate() {
    const name = newTeamName.trim();
    if (!name || isBusy) return;
    setIsBusy(true);
    setError("");
    try {
      // Reuses the same endpoint as signup: creates the team owned by this
      // manager and makes it their active team.
      const created = await apiFetch<{ data: ManagedTeam }>("/api/teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      // Creation stamps JWT metadata (it's the manager's first-team signal for
      // ensureManagerTeam), so refresh the session before reloading.
      await supabase.auth.refreshSession();
      setTeams((prev) => [created.data, ...prev]);
      setNewTeamName("");
      setIsCreating(false);
      setIsOpen(false);
      onTeamChanged(created.data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the team. Please try again.");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="team-switcher" ref={rootRef}>
      <button
        type="button"
        className="team-switcher-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        <UsersIcon className="team-switcher-users" aria-hidden />
        <span className="team-switcher-label">{activeLabel}</span>
        {isOpen ? (
          <ChevronUp className="chevron" aria-hidden />
        ) : (
          <ChevronDown className="chevron" aria-hidden />
        )}
      </button>

      {isOpen ? (
        <div className="team-switcher-menu" role="menu">
          <p className="team-switcher-heading">Your teams</p>
          <div className="team-switcher-list">
            {teams.map((team) => (
              <button
                key={team.id}
                type="button"
                role="menuitemradio"
                aria-checked={team.id === activeTeamId}
                className={`team-switcher-item ${team.id === activeTeamId ? "active" : ""}`}
                disabled={isBusy}
                onClick={() => void handleSwitch(team.id)}
              >
                <span className="team-switcher-item-name">{team.name}</span>
                {team.id === activeTeamId ? (
                  <CheckPlain className="team-switcher-check" aria-label="Active team" />
                ) : null}
              </button>
            ))}
          </div>

          <div className="team-switcher-divider" role="separator" />

          {isCreating ? (
            <div className="team-switcher-create">
              <input
                type="text"
                placeholder="New team name"
                value={newTeamName}
                autoFocus
                onChange={(event) => setNewTeamName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleCreate();
                  }
                  if (event.key === "Escape") {
                    setIsCreating(false);
                    setNewTeamName("");
                  }
                }}
              />
              <div className="team-switcher-create-actions">
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={isBusy}
                  onClick={() => {
                    setIsCreating(false);
                    setNewTeamName("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="sf-btn"
                  disabled={isBusy || !newTeamName.trim()}
                  onClick={() => void handleCreate()}
                >
                  {isBusy ? "Creating…" : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="team-switcher-create-btn"
              disabled={isBusy}
              onClick={() => setIsCreating(true)}
            >
              + Create new team
            </button>
          )}

          {error ? <p className="team-switcher-error">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export default TeamSwitcher;
