import AbstractBuilder from "./../../Abstract.js";
import Result from "../../../Loader/Result.js";
import NBinary from "../../../../NBinary.js";
import Studio from "../../../../Studio.js";
import Games from "../../../../Plugin/Games.js";

export default class Grf extends AbstractBuilder {
    static name = "Waypoints (Manhunt 1/2)";

    /**
     * @param game {Game}
     * @param level {string}
     * @returns {NBinary}
     */
    static build(game, level) {
        const srcAreaLocations = game.findBy({
            level: level,
            type: Studio.AREA_LOCATION
        });

        const srcWaypointRoutes = game.findBy({
            level: level,
            type: Studio.WAYPOINT_ROUTE
        });

        // IMPORTANT:
        // - Do NOT mutate editor data (srcAreaLocations/srcWaypointRoutes)
        // - Create an export-only copy that is deduped + remapped
        const { areaLocations, waypointRoutes } = Grf.prepareExport(srcAreaLocations, srcWaypointRoutes);

        let binary = new NBinary(new ArrayBuffer(1024 * 1024));

        if (game.game === Games.GAMES.MANHUNT_2) {
            binary.setInt32(1095323207); // GNIA
            binary.setInt32(1);          // const
        }

        binary.setInt32(areaLocations.length);

        Grf.createAreas(binary, areaLocations, game);
        Grf.createWaypointRoutes(binary, waypointRoutes);
        Grf.createAreasNames(binary, areaLocations);

        binary.end();
        return binary;
    }

    // -----------------------
    // Helpers
    // -----------------------

    /**
     * Normalizes IDs that may be numbers, numeric strings, or legacy "*_reorder" strings.
     * @param id {any}
     * @returns {any}
     */
    static normalizeId(id) {
        if (id === undefined || id === null) return id;

        if (typeof id === "string") {
            if (id.endsWith("_reorder")) id = id.slice(0, -"_reorder".length);
            if (/^-?\d+$/.test(id)) return parseInt(id, 10);
            return id;
        }

        return id;
    }

    /**
     * Returns a stable “reference id” for a location used by waypoint linkIds.
     * Prefers props.id, then props.linkId, then (as last resort) props.name.
     *
     * @param loc {Result|Object}
     * @returns {any}
     */
    static getLocationRefId(loc) {
        const p = loc?.props || {};
        const a = Grf.normalizeId(p.id);
        if (a !== undefined && a !== null) return a;

        const b = Grf.normalizeId(p.linkId);
        if (b !== undefined && b !== null) return b;

        const c = (p.name !== undefined && p.name !== null) ? String(p.name) : undefined;
        return c;
    }

    /**
     * Build an export-only copy:
     * - Dedupes locations by refId (props.id / props.linkId)
     * - Builds new sequential indices 0..n-1 for export
     * - Remaps all waypoint linkIds and route entries to those new indices
     * - Prunes broken references instead of crashing
     *
     * Does NOT mutate input arrays or objects.
     *
     * @param srcAreaLocations {Result[]}
     * @param srcWaypointRoutes {Result[]}
     * @returns {{ areaLocations: Object[], waypointRoutes: Object[] }}
     */
    static prepareExport(srcAreaLocations, srcWaypointRoutes) {
        // ---- 1) Deduplicate locations by stable ref id (NOT by name) ----
        const kept = [];
        const keptByRef = new Map();         // refId -> keptIndex (in kept)
        const aliasRefToKeptRef = new Map(); // dupRef -> keptRef

        for (const loc of (srcAreaLocations || [])) {
            const refId = Grf.getLocationRefId(loc);
            // If no usable refId, keep it (cannot safely dedupe)
            if (refId === undefined || refId === null || refId === "") {
                kept.push(loc);
                continue;
            }

            if (!keptByRef.has(refId)) {
                keptByRef.set(refId, kept.length);
                kept.push(loc);
                continue;
            }

            // Duplicate by refId: alias to the first one
            aliasRefToKeptRef.set(refId, refId);
        }

        // ---- 2) Build export index mapping (refId -> exportIndex) ----
        // Export index is the position in the deduped list.
        const refToExportIndex = new Map();
        kept.forEach((loc, idx) => {
            const refId = Grf.getLocationRefId(loc);
            if (refId !== undefined && refId !== null && refId !== "") {
                // Map original ref id to new export index
                if (!refToExportIndex.has(refId)) refToExportIndex.set(refId, idx);
            }
        });

        // Also map duplicate refs to the same kept index (in case they exist in links)
        for (const [dupRef] of aliasRefToKeptRef.entries()) {
            if (refToExportIndex.has(dupRef)) continue; // unlikely
            // dupRef maps to itself's kept ref in this alias scheme
            // (keptByRef already points at the first occurrence)
            if (keptByRef.has(dupRef)) {
                refToExportIndex.set(dupRef, keptByRef.get(dupRef));
            }
        }

        // ---- 3) Create export-copy of areaLocations with remapped waypoint linkIds ----
        const exportAreaLocations = kept.map((loc) => {
            const srcProps = loc?.props || {};
            const srcWaypoints = Array.isArray(srcProps.waypoints) ? srcProps.waypoints : [];

            const newWaypoints = [];
            for (const wp of srcWaypoints) {
                if (!wp) continue;

                const oldLink = Grf.normalizeId(wp.linkId);
                if (!refToExportIndex.has(oldLink)) {
                    // broken link -> prune (export should not crash)
                    continue;
                }

                newWaypoints.push({
                    ...wp,
                    linkId: refToExportIndex.get(oldLink),
                    relation: Array.isArray(wp.relation) ? [...wp.relation] : []
                });
            }

            const newProps = {
                ...srcProps,
                // DO NOT overwrite srcProps.id / srcProps.linkId (keeps editor stable)
                unkFlags: Array.isArray(srcProps.unkFlags) ? [...srcProps.unkFlags] : [],
                unkFlags2: Array.isArray(srcProps.unkFlags2) ? [...srcProps.unkFlags2] : [],
                waypoints: newWaypoints
            };

            // Minimal “Result-like” object used by writer
            return {
                name: loc?.name,
                mesh: loc?.mesh,
                props: newProps
            };
        });

        // ---- 4) Create export-copy of waypointRoutes with remapped entries ----
        const exportWaypointRoutes = (srcWaypointRoutes || []).map((route) => {
            const srcProps = route?.props || {};
            const srcEntries = Array.isArray(srcProps.entries) ? srcProps.entries : [];

            const newEntries = [];
            for (const e of srcEntries) {
                const old = Grf.normalizeId(e);
                if (!refToExportIndex.has(old)) {
                    // broken ref -> prune
                    continue;
                }
                newEntries.push(refToExportIndex.get(old));
            }

            return {
                name: route?.name,
                props: {
                    ...srcProps,
                    entries: newEntries
                }
            };
        });

        return {
            areaLocations: exportAreaLocations,
            waypointRoutes: exportWaypointRoutes
        };
    }

    /**
     * @param binary
     * @param areaLocations {Object[]}
     */
    static createAreasNames(binary, areaLocations) {
        let groupIndex = [];
        areaLocations.forEach(function (areaLocation) {
            if (groupIndex.indexOf(areaLocation.props.areaName) !== -1) return;
            groupIndex.push(areaLocation.props.areaName);
        });

        binary.setInt32(groupIndex.length);
        groupIndex.forEach(function (name) {
            binary.writeString(name, 0, true, 0x70);
        });
    }

    /**
     * @param binary {NBinary}
     * @param waypointRoutes {Object[]}
     */
    static createWaypointRoutes(binary, waypointRoutes) {
        binary.setInt32(waypointRoutes.length);

        waypointRoutes.forEach(function (route) {
            binary.writeString(route.name, 0, true, 0x70);

            const entries = (route.props && route.props.entries) ? route.props.entries : [];
            binary.setInt32(entries.length);

            entries.forEach(function (nodeId) {
                binary.setInt32(Grf.normalizeId(nodeId));
            });
        });
    }

    /**
     * @param binary {NBinary}
     * @param areaLocations {Object[]}
     * @param game {Game}
     */
    static createAreas(binary, areaLocations, game) {
        let groupIndex = [];
        areaLocations.forEach(function (areaLocation) {
            if (groupIndex.indexOf(areaLocation.props.areaName) !== -1) return;
            groupIndex.push(areaLocation.props.areaName);
        });

        areaLocations.forEach(function (areaLocation) {
            const mesh = areaLocation.mesh || { position: { x: 0, y: 0, z: 0 } };

            if (areaLocation.props.unkFlags === undefined) areaLocation.props.unkFlags = [];
            if (areaLocation.props.waypoints === undefined) areaLocation.props.waypoints = [];

            binary.writeString(areaLocation.props.name, 0x0, true, 0x70);

            binary.setInt32(groupIndex.indexOf(areaLocation.props.areaName));

            // GRF coordinate system write:
            // file.x = editor.x
            // file.y = -editor.z
            // file.z = editor.y
            binary.setFloat32(mesh.position.x);
            binary.setFloat32(mesh.position.z * -1);
            binary.setFloat32(mesh.position.y);

            binary.setFloat32(areaLocation.props.radius);
            binary.writeString(areaLocation.props.nodeName, 0x0, true, 0x70);

            // unkFlags
            binary.setInt32(areaLocation.props.unkFlags.length);
            areaLocation.props.unkFlags.forEach(function (flag) {
                binary.setInt32(flag);
            });

            // unkFlags2 (Manhunt 2 only)
            if (game.game === Games.GAMES.MANHUNT_2) {
                if (areaLocation.props.unkFlags2 === undefined) areaLocation.props.unkFlags2 = [];

                binary.setInt32(areaLocation.props.unkFlags2.length);
                areaLocation.props.unkFlags2.forEach(function (flag) {
                    binary.setInt32(flag);
                });
            }

            // waypoints
            binary.setInt32(areaLocation.props.waypoints.length);
            areaLocation.props.waypoints.forEach(function (waypoint) {
                if (waypoint.relation === undefined) waypoint.relation = [];

                // waypoint.linkId is already remapped to export indices in prepareExport()
                binary.setInt32(Grf.normalizeId(waypoint.linkId));
                binary.setInt32(waypoint.type);

                binary.setInt32(waypoint.relation.length);
                waypoint.relation.forEach(function (flag) {
                    binary.setInt32(flag);
                });
            });

            if (game.game === Games.GAMES.MANHUNT_2) {
                binary.setInt32(0);
                binary.setInt32(0);
            }
        });
    }
}
