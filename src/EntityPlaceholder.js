// NEW FILE: ./Scene/EntityPlaceholder.js
import {
    Box3,
    Vector3,
    Mesh,
    MeshBasicMaterial,
    CubeGeometry
} from "../Vendor/three.module.js";

export default class EntityPlaceholder {

    static hasPickableGeometry(root) {
        let ok = false;
        if (!root || typeof root.traverse !== "function") return false;

        root.traverse((o) => {
            if (o && o.isMesh && o.geometry) ok = true;
        });

        return ok;
    }

    static makeFallbackCube(size = 0.5) {
        const mesh = new Mesh(
            new CubeGeometry(size, size, size),
            new MeshBasicMaterial({ wireframe: true, color: 0xff11ff })
        );
        mesh.name = "entity_placeholder_cube";
        return mesh;
    }

    static deepClone(root) {
        if (!root || typeof root.clone !== "function") return null;

        const clone = root.clone(true);

        // Ensure per-instance materials/geometries so one placeholder edit doesn't affect all
        if (typeof clone.traverse === "function") {
            clone.traverse((o) => {
                if (!o || !o.isMesh) return;

                if (o.geometry && typeof o.geometry.clone === "function") {
                    o.geometry = o.geometry.clone();
                }

                if (o.material) {
                    if (Array.isArray(o.material)) {
                        o.material = o.material.map((m) => (m && typeof m.clone === "function") ? m.clone() : m);
                    } else if (typeof o.material.clone === "function") {
                        o.material = o.material.clone();
                    }
                }
            });
        }

        return clone;
    }

    static normalizeToSize(root, targetMaxAxis = 0.5) {
        try {
            const box = new Box3().setFromObject(root);
            const size = new Vector3();
            box.getSize(size);

            const maxAxis = Math.max(size.x, size.y, size.z);
            if (maxAxis > 0.00001) {
                const s = targetMaxAxis / maxAxis;
                root.scale.multiplyScalar(s);
            }
        } catch (e) {
            // ignore; keep original scale
        }
    }

    static tagEntityOnAllMeshes(root, entityResult, extraUserData = {}) {
        if (!root) return;

        root.userData = root.userData || {};
        root.userData.entity = entityResult;
        Object.assign(root.userData, extraUserData);

        if (typeof root.traverse === "function") {
            root.traverse((o) => {
                if (!o) return;
                o.userData = o.userData || {};
                o.userData.entity = entityResult;
                Object.assign(o.userData, extraUserData);
            });
        }
    }
}

