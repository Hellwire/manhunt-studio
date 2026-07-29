import AbstractLoader from "./../../Abstract.js";
import Result from "../../Result.js";
import Studio from "../../../../Studio.js";
import Games from "../../../../Plugin/Games.js";
import {
    fileToEditorPosition,
    parseGrf
} from "../../../GrfFormat.js";
import {MathUtils, Vector3} from "../../../../Vendor/three.module.js";

export default class Grf extends AbstractLoader {
    static name = "Waypoints (Manhunt 1/2)";

    static normalizeId(id) {
        if (typeof id === "string" && /^-?\d+$/.test(id)) {
            return parseInt(id, 10);
        }
        return id;
    }

    /**
     * Keep the serializable route data synchronized with the editor objects.
     *
     * @param entry {Result}
     */
    static update(entry) {
        if (!entry || !entry.props) return;

        if (entry.type === Studio.WAYPOINT_ROUTE) {
            const route = entry.props;
            if (Array.isArray(route.locations)) {
                route.entries = route.locations
                    .map(location => location && location.props ? Grf.normalizeId(location.props.id) : undefined)
                    .filter(id => Number.isInteger(id));
            } else if (Array.isArray(route.entries)) {
                route.entries = route.entries.map(Grf.normalizeId);
            }
        }

        if (entry.type === Studio.AREA_LOCATION && Array.isArray(entry.props.waypoints)) {
            entry.props.waypoints.forEach(function (waypoint) {
                if (!waypoint) return;
                waypoint.linkId = Grf.normalizeId(waypoint.linkId);
                if (!Array.isArray(waypoint.relation)) waypoint.relation = [];
            });
        }
    }

    /**
     * Parse and validate the complete file. A complete probe prevents unrelated
     * little-endian files from being mistaken for signature-less MH1 GRFs.
     *
     * @param binary {NBinary}
     * @returns {boolean}
     */
    static canHandle(binary) {
        try {
            parseGrf(binary, "<GRF probe>");
            return true;
        } catch (error) {
            return false;
        }
    }

    static parse(binary, source = "<memory>") {
        return parseGrf(binary, source);
    }

    /**
     * @param binary {NBinary}
     * @param options {{}}
     * @returns {Result[]}
     */
    static list(binary, options) {
        options = options || {};
        const source = options.fileNamePath || "<memory>";
        const graph = parseGrf(binary, source);
        const results = [];
        const locationById = new Map();
        const sharedGroupNames = graph.groupNames.slice();

        graph.areas.forEach(function (area, id) {
            const editorPosition = fileToEditorPosition(graph.game, area.position);
            const location = {
                id: id,
                name: area.name,
                groupIndex: area.groupIndex,
                areaName: area.groupIndex === -1 ? "" : graph.groupNames[area.groupIndex],
                position: new Vector3(editorPosition.x, editorPosition.y, editorPosition.z),
                radius: area.radius,
                nodeName: area.nodeName,
                unkFlags: area.flags.slice(),
                unkFlags2: area.flags2.slice(),
                waypoints: area.waypoints.map(function (waypoint) {
                    return {
                        linkId: waypoint.linkId,
                        type: waypoint.type,
                        relation: waypoint.relations.slice()
                    };
                }),
                grfGroupNames: sharedGroupNames,
                grfVersion: graph.version,
                mh2Tail: area.tail ? area.tail.slice() : null
            };

            const result = new Result(
                Studio.AREA_LOCATION,
                `node_${MathUtils.generateUUID()}`,
                "",
                0,
                location,
                function () {
                    return location;
                }
            );
            result.gameFourCC = graph.game;
            result.platformFourCC = Games.PLATFORM.PC;

            locationById.set(id, result);
            results.push(result);
        });

        graph.routes.forEach(function (parsedRoute) {
            const route = {
                name: parsedRoute.name,
                entries: parsedRoute.entries.slice(),
                locations: parsedRoute.entries.map(areaId => locationById.get(areaId)),
                grfGroupNames: sharedGroupNames,
                grfVersion: graph.version
            };

            const result = new Result(
                Studio.WAYPOINT_ROUTE,
                route.name,
                "",
                0,
                route,
                function () {
                    return route;
                }
            );
            result.gameFourCC = graph.game;
            result.platformFourCC = Games.PLATFORM.PC;
            results.push(result);
        });

        return results;
    }
}
