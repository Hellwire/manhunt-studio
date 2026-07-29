import AbstractBuilder from "./../../Abstract.js";
import NBinary from "../../../../NBinary.js";
import Studio from "../../../../Studio.js";
import Games from "../../../../Plugin/Games.js";
import {
    editorToFilePosition,
    GrfError,
    writeGrf
} from "../../../GrfFormat.js";

export default class Grf extends AbstractBuilder {
    static name = "Waypoints (Manhunt 1/2)";

    /**
     * @param game {Game}
     * @param level {string}
     * @returns {NBinary}
     */
    static build(game, level) {
        if (!game || (game.game !== Games.GAMES.MANHUNT && game.game !== Games.GAMES.MANHUNT_2)) {
            throw new GrfError("Cannot export GRF because the loaded game could not be identified as Manhunt 1 or Manhunt 2");
        }

        const sourceAreas = game.findBy({
            level: level,
            type: Studio.AREA_LOCATION
        });
        const sourceRoutes = game.findBy({
            level: level,
            type: Studio.WAYPOINT_ROUTE
        });

        const prepared = Grf.prepareExport(sourceAreas, sourceRoutes);
        const graph = Grf.createGraph(game.game, prepared);
        return new NBinary(writeGrf(graph, `${level || "<unknown level>"} GRF export`));
    }

    static normalizeId(id) {
        if (id === undefined || id === null) return id;
        if (typeof id === "string") {
            if (id.endsWith("_reorder")) id = id.slice(0, -"_reorder".length);
            if (/^-?\d+$/.test(id)) return parseInt(id, 10);
        }
        return id;
    }

    static normalizeInteger(value) {
        if (typeof value === "string" && /^-?\d+$/.test(value)) {
            return parseInt(value, 10);
        }
        return value;
    }

    static normalizeIntegerArray(values) {
        return Array.isArray(values) ? values.map(Grf.normalizeInteger) : [];
    }

    /**
     * A GRF link points to the area's implicit file index. MHS keeps the
     * imported index as an editor-only stable ID so deletions can be remapped.
     */
    static getLocationRefId(location) {
        const props = location && location.props ? location.props : {};
        const id = Grf.normalizeId(props.id);
        if (id !== undefined && id !== null && id !== "") return id;

        const legacyLinkId = Grf.normalizeId(props.linkId);
        if (legacyLinkId !== undefined && legacyLinkId !== null && legacyLinkId !== "") {
            return legacyLinkId;
        }
        return undefined;
    }

    static locationLabel(location, index) {
        const props = location && location.props ? location.props : {};
        const displayName = props.name || props.nodeName || (location && location.name);
        return displayName ? `"${displayName}"` : `at editor index ${index}`;
    }

    static resolveLocationIndex(reference, objectToIndex, refToIndex, context) {
        if (reference && typeof reference === "object" && objectToIndex.has(reference)) {
            return objectToIndex.get(reference);
        }

        const refId = reference && typeof reference === "object"
            ? Grf.getLocationRefId(reference)
            : Grf.normalizeId(reference);

        if (!refToIndex.has(refId)) {
            throw new GrfError(`${context} references missing node ID ${String(refId)}`);
        }
        return refToIndex.get(refId);
    }

    static collectGroupNames(areas, routes) {
        let groupNames = null;
        [...areas, ...routes].forEach(function (entry) {
            const candidate = entry && entry.props ? entry.props.grfGroupNames : null;
            if (!Array.isArray(candidate)) return;
            if (groupNames === null) {
                groupNames = candidate.slice();
                return;
            }
            candidate.forEach(function (name) {
                if (groupNames.indexOf(name) === -1) groupNames.push(name);
            });
        });
        return groupNames || [];
    }

    /**
     * Create an export-only copy and remap stable editor IDs to the file's
     * required sequential indices. Invalid references are reported rather than
     * silently dropped, because silent repair changes AI behavior.
     */
    static prepareExport(sourceAreas, sourceRoutes) {
        const areas = Array.isArray(sourceAreas) ? sourceAreas : [];
        const routes = Array.isArray(sourceRoutes) ? sourceRoutes : [];
        const objectToIndex = new Map();
        const refToIndex = new Map();

        areas.forEach(function (location, index) {
            if (!location || !location.props) {
                throw new GrfError(`Area location at editor index ${index} is missing its data`);
            }

            const refId = Grf.getLocationRefId(location);
            if (refId === undefined) {
                throw new GrfError(`Area location ${Grf.locationLabel(location, index)} has no node ID`);
            }
            if (refToIndex.has(refId)) {
                throw new GrfError(`Duplicate node ID ${String(refId)}; every MapAI node must have a unique editor ID`);
            }

            objectToIndex.set(location, index);
            refToIndex.set(refId, index);
        });

        const groupNames = Grf.collectGroupNames(areas, routes);
        const exportAreas = areas.map(function (location, areaIndex) {
            const props = location.props;
            const position = location.mesh && location.mesh.position
                ? location.mesh.position
                : props.position;

            if (!position) {
                throw new GrfError(`Area ${areaIndex} has no position`);
            }

            let areaName = props.areaName;
            if (areaName === undefined && Number.isInteger(props.groupIndex) &&
                props.groupIndex >= 0 && props.groupIndex < groupNames.length) {
                areaName = groupNames[props.groupIndex];
            }
            areaName = areaName === undefined || areaName === null ? "" : String(areaName);

            let groupIndex = Grf.normalizeInteger(props.groupIndex);
            if (groupIndex === -1 && areaName === "") {
                // Preserve the format's explicit "no group" value.
            } else if (Number.isInteger(groupIndex) && groupIndex >= 0 &&
                groupIndex < groupNames.length && groupNames[groupIndex] === areaName) {
                // Preserve the original group ordering, including unused groups.
            } else {
                groupIndex = groupNames.indexOf(areaName);
                if (groupIndex === -1) {
                    if (areaName === "") {
                        groupIndex = -1;
                    } else {
                        groupNames.push(areaName);
                        groupIndex = groupNames.length - 1;
                    }
                }
            }

            const sourceWaypoints = Array.isArray(props.waypoints) ? props.waypoints : [];
            const waypoints = sourceWaypoints.map(function (waypoint, waypointIndex) {
                if (!waypoint) {
                    throw new GrfError(`Area ${areaIndex} waypoint ${waypointIndex} is missing`);
                }
                return {
                    linkId: Grf.resolveLocationIndex(
                        waypoint.linkId,
                        objectToIndex,
                        refToIndex,
                        `Area ${areaIndex} waypoint ${waypointIndex}`
                    ),
                    type: Grf.normalizeInteger(waypoint.type),
                    relation: Grf.normalizeIntegerArray(waypoint.relation)
                };
            });

            return {
                name: location.name,
                props: {
                    ...props,
                    name: props.name === undefined || props.name === null ? "" : String(props.name),
                    nodeName: props.nodeName === undefined || props.nodeName === null ? "" : String(props.nodeName),
                    areaName: areaName,
                    groupIndex: groupIndex,
                    position: {x: position.x, y: position.y, z: position.z},
                    unkFlags: Grf.normalizeIntegerArray(props.unkFlags),
                    unkFlags2: Grf.normalizeIntegerArray(props.unkFlags2),
                    waypoints: waypoints,
                    grfGroupNames: groupNames
                }
            };
        });

        const exportRoutes = routes.map(function (route, routeIndex) {
            const props = route && route.props ? route.props : {};
            const references = Array.isArray(props.locations)
                ? props.locations
                : (Array.isArray(props.entries) ? props.entries : []);
            const entries = references.map(function (reference, entryIndex) {
                return Grf.resolveLocationIndex(
                    reference,
                    objectToIndex,
                    refToIndex,
                    `Route ${routeIndex} entry ${entryIndex}`
                );
            });

            return {
                name: props.name === undefined || props.name === null
                    ? String(route && route.name !== undefined ? route.name : "")
                    : String(props.name),
                props: {
                    ...props,
                    entries: entries,
                    grfGroupNames: groupNames
                }
            };
        });

        return {
            areaLocations: exportAreas,
            waypointRoutes: exportRoutes,
            groupNames: groupNames
        };
    }

    static createGraph(game, prepared) {
        return {
            game: game,
            version: game === Games.GAMES.MANHUNT_2 ? 1 : null,
            areas: prepared.areaLocations.map(function (location) {
                const props = location.props;
                return {
                    name: props.name,
                    groupIndex: props.groupIndex,
                    position: editorToFilePosition(game, props.position),
                    radius: props.radius,
                    nodeName: props.nodeName,
                    flags: props.unkFlags.slice(),
                    flags2: props.unkFlags2.slice(),
                    waypoints: props.waypoints.map(function (waypoint) {
                        return {
                            linkId: waypoint.linkId,
                            type: waypoint.type,
                            relations: waypoint.relation.slice()
                        };
                    }),
                    tail: game === Games.GAMES.MANHUNT_2 ? [0, 0] : null
                };
            }),
            routes: prepared.waypointRoutes.map(function (route) {
                return {
                    name: route.name,
                    entries: route.props.entries.slice()
                };
            }),
            groupNames: prepared.groupNames.slice()
        };
    }
}
