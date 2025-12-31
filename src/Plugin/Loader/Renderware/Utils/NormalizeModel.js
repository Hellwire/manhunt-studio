// NormalizeModel.js (FULL PATCHED FILE)

import {Bone, Face3, Matrix4, Skeleton, Vector2, Vector3, Vector4} from "./../../../../Vendor/three.module.js";

export default class NormalizeModel{

    constructor( data ){
        this.data = data;
        this.result = {};

        this.frameCount = this.data.frames.frameList.length;

        this.allBones = [];
        this.allBonesMesh = [];

        // Axis fix: RW/game (x,y,z; Z-up) -> Editor/Three (x,z,-y; Y-up)
        this._axisFixEnabled = true;
        this._axisFixM = new Matrix4().makeRotationX(Math.PI / 2);
        this._axisFixMInv = new Matrix4().makeRotationX(-Math.PI / 2);

        this.#normalize();
    }

    // RW/game vec -> editor vec: (x, z, -y)
    _fixVec3(v){
        return new Vector3(v.x, v.z, -v.y);
    }

    _fixVec3FromArray(a){
        // a = [x,y,z]
        return new Vector3(a[0], a[2], -a[1]);
    }

    // RW/game matrix -> editor matrix: C * M * C^-1
    _fixMatrix4(m){
        if (!this._axisFixEnabled) return m;
        const out = new Matrix4();
        out.copy(this._axisFixM).multiply(m).multiply(this._axisFixMInv);
        return out;
    }

    #getFrameBones(){

        let bones = [];
        for(let i = 0; i < this.frameCount; i++){

            let name = "bone" + i;

            if (this.data.frameNames.length > 0){
                if (this.data.frames.length === this.data.frameNames.length){
                    name = this.data.frameNames[i];
                }else{
                    name = i === 0 ? "RootDummy" : this.data.frameNames[i - 1];
                }
            }

            let bone = {
                name: name,
                userProp: {},
                frame: this.data.frames.frameList[i]
            };

            if (i > 0 && typeof this.data.boneIdArray !== "undefined"){
                bone.userProp.boneId = this.data.boneIdArray[i-1];
            }

            bones.push(bone);
        }

        for(let i = 0; i < this.frameCount; i++){
            let bne = bones[i];
            let boneId = bne.userProp.boneId;

            if (typeof boneId !== "undefined") {
                let hAnimBoneArray = this.data.hAnimBoneArray;
                for (let j = 0; j < hAnimBoneArray.length; j++) {
                    if (hAnimBoneArray[j].boneId === boneId) {
                        bne.userProp.boneIndex = hAnimBoneArray[j].boneIndex;
                        bne.userProp.boneType = hAnimBoneArray[j].boneType;
                    }
                }
            }
        }

        return bones;
    }

    #getSkinBones(bones){
        let skinBones = [];

        for(let i = 0; i < this.frameCount; i++){
            for(let j = 0; j < this.frameCount; j++){
                let bne = bones[j];
                let boneIndex = bne.userProp.boneIndex;
                if (typeof boneIndex !== "undefined" && boneIndex === i)
                    skinBones.push(bne);
            }
        }

        return skinBones;
    }

    #getMeshes(){
        let _this = this;

        let chunksGeometry = this.data.geometries;

        let meshes = [];

        for(let i = 0; i < chunksGeometry.length; i++){

            let skinFlag = false;
            let skinPLG = {};

            if (this.data.skins.length > 0){
                let chunkSkin = this.data.skins[i];
                if (chunkSkin !== false && chunkSkin !== undefined){
                    skinFlag = true;
                    skinPLG = chunkSkin.skinPLG;
                }
            }

            let mesh = {
                skinned: skinFlag,
                parentFrameID: this.data.atomics[i].frameIndex,
                material: [],
                skinPLG: skinPLG,
                face: chunksGeometry[i].faceMat.face,
                materialPerFace: chunksGeometry[i].faceMat.matId,
                normal: chunksGeometry[i].normal,
                vertices: chunksGeometry[i].vert,
                uv1: chunksGeometry[i].uv1,
                uv2: chunksGeometry[i].uv2,
                cpv: chunksGeometry[i].vColor,
            };

            /**
             * I did here a hack:
             * The material names for all objects are read into one array (Material.js:43)
             * but each object need his own material.
             * i currently hope that the order of the matId is always ASC
             * so we can "shift" the values from the big name array
             */
            let requiredMaterials = [];
            chunksGeometry[i].faceMat.matId.forEach(function (matId) {
                if (requiredMaterials.indexOf(matId) !== -1) return;
                requiredMaterials.push(matId);

                if (_this.data.material !== undefined)
                    mesh.material.push({
                        diffuse: _this.data.materials[matId].rgba,
                        textureName: _this.data.material.shift(), //shift hack to get the correct texturename
                        opacitymap: null,
                    });
            });

            meshes.push(mesh);
        }

        return meshes;
    }

    #createBone( data ){
        let bone = new Bone();
        bone.name = data.name;

        // frame.matrix comes from RW/game basis; convert to editor basis
        let m = (new Matrix4()).fromArray(data.frame.matrix);
        m = this._fixMatrix4(m);

        bone.applyMatrix4(m);
        return bone;
    }

    #generateSkeletonBones(frameBones, skinBones){

        let _this = this;
        frameBones.forEach(function (bone) {
            _this.allBones.push(_this.#createBone(bone));
        });

        frameBones.forEach(function (bone, index) {
            frameBones.forEach(function (boneInner, indexInner) {
                if (indexInner === 0) return;

                if (index === boneInner.frame.parentFrameID - 1){
                    _this.allBones[index].add(_this.allBones[indexInner]);
                }
            });
        });

        if (skinBones.length > 0){
            skinBones.forEach(function (boneInner) {
                frameBones.forEach(function (bone, indexInner) {
                    if (bone.name === boneInner.name ){
                        _this.allBonesMesh.push(_this.allBones[indexInner]);
                    }
                });
            });
        }
    }

    #normalize(){
        let meshes = this.#getMeshes();
        let frameBones = this.#getFrameBones();
        let skinBones = this.#getSkinBones(frameBones);
        this.#generateSkeletonBones(frameBones, skinBones);

        let result = {
            skeleton: false,
            bones: [],
            objects: []
        };

        result.skeleton = new Skeleton( this.allBones );
        result.skeleton.bones.forEach(function(bone){
            bone.updateWorldMatrix();
        });

        let meshBone;
        meshes.forEach((mesh, index) => {
            meshBone = result.skeleton.bones[mesh.parentFrameID];

            // Pre-fix normals once (if present)
            let fixedNormals = [];
            if (mesh.normal && mesh.normal.length > 0){
                const n0 = mesh.normal[0];
                if (n0 instanceof Vector3){
                    fixedNormals = mesh.normal.map(n => this._fixVec3(n));
                } else {
                    // assume array normals like [x,y,z]
                    fixedNormals = mesh.normal.map(n => this._fixVec3FromArray(n));
                }
            }

            let genericObject = {
                material: [],
                //Note: Models from 7Sin has per mesh a skin ?
                skinning: index === 0 ? mesh.skinned : false,
                meshBone: meshBone,

                faces: [],
                faceVertexUvs: [[]],

                vertices: [],
                skinIndices: [],
                skinWeights: [],
            };

            mesh.material.forEach(function (parsedMaterial) {
                genericObject.material.push(parsedMaterial.textureName);
            });

            mesh.vertices.forEach((vertexInfo, vi) => {
                if (skinBones.length > 0 && typeof mesh.skinPLG.indices !== "undefined") {

                    let indice = new Vector4(0,0,0,0);
                    indice.fromArray(mesh.skinPLG.indices[vi]);
                    genericObject.skinIndices.push(indice);

                    let weight = new Vector4(0,0,0,0);
                    weight.fromArray(mesh.skinPLG.weights[vi]);
                    genericObject.skinWeights.push(weight);
                }

                // Vertex axis fix: (x, z, -y)
                genericObject.vertices.push(
                    new Vector3(vertexInfo[0], vertexInfo[2], -vertexInfo[1])
                );
            });

            for(let x = 0; x < mesh.face.length; x++) {

                let face = new Face3(mesh.face[x][0], mesh.face[x][1], mesh.face[x][2]);
                face.materialIndex = mesh.materialPerFace[x];

                if (fixedNormals.length > 0){
                    face.vertexNormals = [
                        fixedNormals[face.a],
                        fixedNormals[face.b],
                        fixedNormals[face.c]
                    ];
                }

                if(mesh.uv1.length > 0){
                    genericObject.faceVertexUvs[0].push([
                        new Vector2(mesh.uv1[face.a][0], mesh.uv1[face.a][1]),
                        new Vector2(mesh.uv1[face.b][0], mesh.uv1[face.b][1]),
                        new Vector2(mesh.uv1[face.c][0], mesh.uv1[face.c][1]),
                    ]);
                }

                genericObject.faces.push(face);
            }

            result.objects.push(genericObject);
        });

        if (this.allBonesMesh.length > 0){
            //we need to rebuild the skeleton based only on mesh bones otherwise the indices and weight orders are wrong
            result.skeleton = new Skeleton( this.allBonesMesh );
        }

        this.result = result;
    }

    #get(field){
        if (this.result[field] === undefined)
            return false;

        return this.result[field];
    }

    getMaterial(){
        return this.#get('material');
    }

    getObjects(){
        return this.#get('objects');
    }

    getSkeleton(){
        return this.#get('skeleton');
    }

    getBones(){
        return this.#get('bones');
    }
}
