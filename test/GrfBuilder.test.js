import assert from "assert";
import Grf from "../src/Plugin/Builder/Game/ManhuntGeneric/Grf.js";
import {GrfError} from "../src/Plugin/GrfFormat.js";

function location(id, links = [], areaName = "area") {
    return {
        name: `editor_${id}`,
        mesh: {position: {x: id, y: id + 1, z: id + 2}},
        props: {
            id: id,
            name: `file_${id}`,
            nodeName: "",
            areaName: areaName,
            groupIndex: 0,
            grfGroupNames: ["area", "unused"],
            radius: 0.5,
            unkFlags: [],
            unkFlags2: [],
            waypoints: links.map(linkId => ({
                linkId: linkId,
                type: 3,
                relation: []
            }))
        }
    };
}

describe("GRF editor export preparation", function () {
    it("remaps links after deletion without mutating editor objects", function () {
        const first = location(10, [30]);
        const last = location(30, [10]);
        const sourceWaypoints = first.props.waypoints;
        const route = {
            name: "route",
            props: {
                name: "route",
                entries: [10, 30],
                locations: [first, last],
                grfGroupNames: ["area", "unused"]
            }
        };

        const prepared = Grf.prepareExport([first, last], [route]);
        assert.strictEqual(prepared.areaLocations[0].props.waypoints[0].linkId, 1);
        assert.strictEqual(prepared.areaLocations[1].props.waypoints[0].linkId, 0);
        assert.deepStrictEqual(prepared.waypointRoutes[0].props.entries, [0, 1]);
        assert.deepStrictEqual(prepared.groupNames, ["area", "unused"]);
        assert.strictEqual(first.props.waypoints, sourceWaypoints);
        assert.strictEqual(first.props.waypoints[0].linkId, 30);
    });

    it("keeps an intentionally cleared route empty", function () {
        const first = location(0);
        const route = {
            name: "route",
            props: {
                name: "route",
                entries: [0],
                locations: []
            }
        };
        const prepared = Grf.prepareExport([first], [route]);
        assert.deepStrictEqual(prepared.waypointRoutes[0].props.entries, []);
    });

    it("rejects duplicate node IDs", function () {
        assert.throws(
            () => Grf.prepareExport([location(1), location("1")], []),
            /Duplicate node ID 1/
        );
    });

    it("rejects broken waypoint and route references", function () {
        assert.throws(
            () => Grf.prepareExport([location(1, [99])], []),
            GrfError
        );
        assert.throws(
            () => Grf.prepareExport(
                [location(1)],
                [{name: "bad", props: {entries: [99]}}]
            ),
            GrfError
        );
    });
});
