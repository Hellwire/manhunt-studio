import assert from "assert";
import Games from "../src/Plugin/Games.js";
import {
    editorToFilePosition,
    fileToEditorPosition,
    GrfError,
    parseGrf,
    writeGrf
} from "../src/Plugin/GrfFormat.js";

function sampleGraph(game) {
    return {
        game: game,
        version: game === Games.GAMES.MANHUNT_2 ? 1 : null,
        areas: [
            {
                name: "first",
                groupIndex: 1,
                position: {x: 12.5, y: -3.25, z: 44},
                radius: 0.75,
                nodeName: "node_a",
                flags: game === Games.GAMES.MANHUNT_2 ? [] : [1],
                flags2: game === Games.GAMES.MANHUNT_2 ? [1] : [],
                waypoints: [{linkId: 1, type: 3, relations: [7]}],
                tail: game === Games.GAMES.MANHUNT_2 ? [0, 0] : null
            },
            {
                name: "second",
                groupIndex: 0,
                position: {x: -1, y: 2, z: 3},
                radius: 1.5,
                nodeName: "",
                flags: [],
                flags2: [],
                waypoints: [{linkId: 0, type: 3, relations: []}],
                tail: game === Games.GAMES.MANHUNT_2 ? [0, 0] : null
            }
        ],
        routes: [{name: "patrol", entries: [0, 1]}],
        groupNames: ["unused-first", "active"]
    };
}

describe("GRF format", function () {
    for (const game of [Games.GAMES.MANHUNT, Games.GAMES.MANHUNT_2]) {
        it(`round-trips every ${game} field and byte`, function () {
            const original = writeGrf(sampleGraph(game));
            const parsed = parseGrf(original, `${game} test`);
            const rebuilt = writeGrf(parsed);

            assert.deepStrictEqual(new Uint8Array(rebuilt), new Uint8Array(original));
            assert.deepStrictEqual(parsed.routes, sampleGraph(game).routes);
            assert.deepStrictEqual(parsed.groupNames, sampleGraph(game).groupNames);
        });
    }

    it("keeps the MH2 file/editor coordinate basis unchanged", function () {
        const position = {x: 1, y: 2, z: 3};
        assert.deepStrictEqual(fileToEditorPosition(Games.GAMES.MANHUNT_2, position), position);
        assert.deepStrictEqual(editorToFilePosition(Games.GAMES.MANHUNT_2, position), position);
    });

    it("uses inverse MH1 file/editor coordinate transforms", function () {
        const filePosition = {x: 1, y: 2, z: 3};
        const editorPosition = fileToEditorPosition(Games.GAMES.MANHUNT, filePosition);
        assert.deepStrictEqual(editorPosition, {x: 1, y: 3, z: -2});
        assert.deepStrictEqual(
            editorToFilePosition(Games.GAMES.MANHUNT, editorPosition),
            filePosition
        );
    });

    it("rejects dangling links instead of silently changing the graph", function () {
        const graph = sampleGraph(Games.GAMES.MANHUNT_2);
        graph.areas[0].waypoints[0].linkId = 999;
        assert.throws(() => writeGrf(graph), GrfError);
    });

    it("rejects MH2 primary-list data that desynchronizes the PC runtime", function () {
        const graph = sampleGraph(Games.GAMES.MANHUNT_2);
        graph.areas[0].flags = [1];
        assert.throws(() => writeGrf(graph), /primary list/);
    });

    it("grows beyond the former fixed one-megabyte export buffer", function () {
        this.timeout(10000);
        const graph = sampleGraph(Games.GAMES.MANHUNT_2);
        graph.routes = [];
        graph.groupNames = ["large"];
        graph.areas = [];

        for (let index = 0; index < 9000; index++) {
            graph.areas.push({
                name: `node_${index}_${"x".repeat(96)}`,
                groupIndex: 0,
                position: {x: index, y: 0, z: 0},
                radius: 0.5,
                nodeName: "",
                flags: [],
                flags2: [],
                waypoints: [],
                tail: [0, 0]
            });
        }

        const output = writeGrf(graph);
        assert.ok(output.byteLength > 1024 * 1024);
        assert.strictEqual(parseGrf(output).areas.length, 9000);
    });
});
