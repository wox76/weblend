import * as THREE from 'three';

export function subdivide(meshData, selectedFaceIds = []) {
    // 1. Identify Faces to Subdivide
    const facesToSubdivide = new Set();
    if (selectedFaceIds && selectedFaceIds.length > 0) {
        for (const fid of selectedFaceIds) {
            const f = meshData.faces.get(fid);
            if (f) facesToSubdivide.add(f);
        }
    } else {
        // If no selection, maybe subdivide all? For now, do nothing or all.
        // Let's assume user wants to subdivide selected. If none, return.
        return; 
    }

    // 2. Identify Edges to Split
    // We iterate facesToSubdivide and collect their edges.
    const edgesToSplit = new Set();
    for (const face of facesToSubdivide) {
        for (const eid of face.edgeIds) {
            edgesToSplit.add(eid);
        }
    }

    // 3. Process Edges: Create Midpoints and Update Neighbors
    // Map: EdgeID -> NewVertex
    const splitMap = new Map();

    for (const eid of edgesToSplit) {
        const edge = meshData.edges.get(eid);
        if (!edge) continue;

        const v1 = meshData.vertices.get(edge.v1Id);
        const v2 = meshData.vertices.get(edge.v2Id);

        // Midpoint
        const newPos = new THREE.Vector3().addVectors(v1.position, v2.position).multiplyScalar(0.5);
        const midV = meshData.addVertex(newPos);
        splitMap.set(eid, midV);

        // Handle Neighbors (Faces sharing this edge but NOT being subdivided)
        // They need to become N-gons (include the new vertex)
        const faceIds = Array.from(edge.faceIds);
        for (const fid of faceIds) {
            const face = meshData.faces.get(fid);
            if (face && !facesToSubdivide.has(face)) {
                // This is a neighbor face. We must insert midV between v1 and v2.
                // We'll reconstruct this face.
                
                // Find index of v1 and v2
                const idx1 = face.vertexIds.indexOf(v1.id);
                const idx2 = face.vertexIds.indexOf(v2.id);
                
                // They should be adjacent (modulo length)
                // Insert new vertex ID
                const newVertexIds = [...face.vertexIds];
                const newUvs = face.uvs ? [...face.uvs] : [];

                // Logic to insert between
                // If indices are k and k+1
                // Insert at k+1
                
                // Handling wrapping: if idx1 is last and idx2 is 0
                // Insert at end (or 0?)
                
                // Let's construct a new ordered list based on edge continuity
                // Simple insert:
                // If v1 is at i, v2 is at i+1 (or vice versa)
                // Insert midV between them.
                
                // Determine order
                let insertAt = -1;
                const len = face.vertexIds.length;
                if ((idx1 + 1) % len === idx2) {
                    insertAt = (idx1 + 1); // Insert before idx2
                } else if ((idx2 + 1) % len === idx1) {
                    insertAt = (idx2 + 1); // Insert before idx1
                }

                if (insertAt !== -1) {
                    // Adjust for array splice
                    // If insertAt is len (wrapping), just push.
                    // But splice handles index len correctly (appends).
                    // Wait, if wrapping (e.g. last and first), we append to end?
                    // Yes, conceptually between last and first is at the end of the list.
                    
                    if (insertAt === 0 && ((idx1 === len - 1) || (idx2 === len - 1))) {
                         // Case: Wrapping. Append to end.
                         newVertexIds.push(midV.id);
                         if (newUvs.length) {
                             // Interpolate UV
                             const uv1 = face.uvs[idx1];
                             const uv2 = face.uvs[idx2];
                             const midUV = new THREE.Vector2().addVectors(uv1, uv2).multiplyScalar(0.5);
                             newUvs.push(midUV);
                         }
                    } else {
                         // Normal case
                         newVertexIds.splice(insertAt, 0, midV.id);
                         if (newUvs.length) {
                             const uv1 = face.uvs[idx1];
                             const uv2 = face.uvs[idx2];
                             const midUV = new THREE.Vector2().addVectors(uv1, uv2).multiplyScalar(0.5);
                             newUvs.splice(insertAt, 0, midUV);
                         }
                    }
                    
                    // Re-create face
                    const matIndex = face.materialIndex;
                    meshData.deleteFace(face);
                    
                    // Get Vertex objects
                    const newVertices = newVertexIds.map(id => meshData.vertices.get(id));
                    meshData.addFace(newVertices, newUvs, matIndex);
                }
            }
        }
    }

    // 4. Subdivide Faces
    const newFaceIds = [];
    for (const face of facesToSubdivide) {
        const centerPos = new THREE.Vector3(0, 0, 0);
        const vertices = face.vertexIds.map(vid => meshData.vertices.get(vid));
        
        vertices.forEach(v => centerPos.add(v.position));
        centerPos.divideScalar(vertices.length);

        const centerV = meshData.addVertex(centerPos);

        // Pre-calculate midpoints in order
        const midPoints = [];
        const len = vertices.length;
        for (let i = 0; i < len; i++) {
            const vCurrent = vertices[i];
            const vNext = vertices[(i + 1) % len];
            const edge = meshData.getEdge(vCurrent.id, vNext.id);
            
            if (edge && splitMap.has(edge.id)) {
                midPoints.push(splitMap.get(edge.id));
            } else {
                console.warn("Subdivide: Missing edge or split info", edge);
            }
        }

        // Create Quads
        const oldUVs = face.uvs || [];
        const hasUVs = oldUVs.length === len;
        
        // Calculate Center UV
        let centerUV = new THREE.Vector2(0, 0);
        if (hasUVs) {
            oldUVs.forEach(uv => centerUV.add(uv));
            centerUV.divideScalar(len);
        }

        const matIndex = face.materialIndex;

        meshData.deleteFace(face);

        for (let i = 0; i < len; i++) {
            const prevIdx = (i - 1 + len) % len;
            const midPrev = midPoints[prevIdx];
            const corner = vertices[i];
            const midNext = midPoints[i];

            if (!midPrev || !midNext) continue;

            const newFaceVerts = [midPrev, corner, midNext, centerV];
            let newFaceUVs = [];

            if (hasUVs) {
                const uvCorner = oldUVs[i];
                const uvPrev = oldUVs[prevIdx];
                const uvNext = oldUVs[(i+1)%len];
                
                const uvMidPrev = new THREE.Vector2().addVectors(uvCorner, uvPrev).multiplyScalar(0.5);
                const uvMidNext = new THREE.Vector2().addVectors(uvCorner, uvNext).multiplyScalar(0.5);
                
                newFaceUVs = [uvMidPrev, uvCorner, uvMidNext, centerUV];
            }

            const newFace = meshData.addFace(newFaceVerts, newFaceUVs, matIndex);
            newFaceIds.push(newFace.id);
        }
    }
    
    return newFaceIds;
}
