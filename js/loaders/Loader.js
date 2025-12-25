import * as THREE from 'three';
import { AddObjectCommand } from "../commands/AddObjectCommand.js";
import { ShadingUtils } from "../utils/ShadingUtils.js";
import OBJLoader from './OBJLoader.js';
import { GLTFImporter } from './GLTFLoader.js';

export class Loader {
  constructor(editor) {
    this.editor = editor;
  }

  async load(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.addEventListener('progress', (event) => {
      const size = '(' + parseFloat(Math.floor(event.total / 1000).toFixed(3)) + ' KB)';
      const progress = Math.floor((event.loaded / event.total) * 100) + '%';
      console.log('Loading', file.name, size, progress);
    });

    const handlers = {
			'obj': () => this.loadObj(file, reader),
            'gltf': () => this.loadGltf(file),
            'glb': () => this.loadGltf(file),
            'png': () => this.loadImage(file, reader),
            'jpg': () => this.loadImage(file, reader),
            'jpeg': () => this.loadImage(file, reader)
    };

    if (handlers[extension]) {
      handlers[extension]();
    } else {
      alert(`Unsupported file format: .${extension}. Only .obj, .gltf, .glb, .png, .jpg files are supported.`);
    }
  }

  loadImage(file, reader) {
    reader.addEventListener('load', (event) => {
        const image = new Image();
        image.src = event.target.result;
        image.onload = () => {
            const texture = new THREE.Texture(image);
            texture.name = file.name;
            texture.sourceFile = file.name;
            texture.needsUpdate = true;
            
            this.editor.textures.push(texture);
            this.editor.signals.textureAdded.dispatch(texture);
        };
    });
    reader.readAsDataURL(file);
  }

  async loadGltf(file) {
    try {
        const importer = new GLTFImporter();
        const meshesData = await importer.load(file);

        const newMeshes = meshesData.map(({ name, meshData, originalMaterial }) => {
            const shading = 'flat'; // Default shading
            const geometry = ShadingUtils.createGeometryWithShading(meshData, shading);
            
            // Use original material if possible, or fallback
            let material = originalMaterial;
            if (!material) {
                material = new THREE.MeshStandardMaterial({
                    color: 0xcccccc,
                    metalness: 0.5,
                    roughness: 0.2,
                    side: THREE.DoubleSide
                });
            }

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = name;
            mesh.userData.meshData = meshData;
            mesh.userData.shading = shading;
            
            if (mesh.geometry.boundingBox === null) mesh.geometry.computeBoundingBox();
            if (mesh.geometry.boundingSphere === null) mesh.geometry.computeBoundingSphere();
            
            return mesh;
        });

        if (newMeshes.length > 0) {
            let finalObject;
            if (newMeshes.length === 1) {
                finalObject = newMeshes[0];
            } else {
                finalObject = new THREE.Group();
                finalObject.name = file.name;
                newMeshes.forEach(m => finalObject.add(m));
            }
            this.editor.execute(new AddObjectCommand(this.editor, finalObject));
        }

    } catch (error) {
        console.error('Error loading GLTF:', error);
        alert('Error loading GLTF file');
    }
  }

  async loadObj(file, reader) {
    reader.addEventListener('load', (event) => {
      const text = event.target.result;
      const meshObjects = OBJLoader.fromOBJText(text);
      const shadingObjects = ShadingUtils.getShadingFromOBJ(text);

      const meshes = meshObjects.map(({ name, meshData }, i) => {
        const shading = shadingObjects[i] || 'flat';
        const geometry = ShadingUtils.createGeometryWithShading(meshData, shading);

        const material = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.5,
          roughness: 0.2,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = name || file.name;
        mesh.userData.meshData = meshData;
        mesh.userData.shading = shading;
        mesh.geometry.computeBoundingSphere();
        mesh.geometry.computeBoundingBox();
        return mesh;
      });

      let finalObject;
      if (meshes.length === 1) {
        finalObject = meshes[0];
      } else {
        finalObject = new THREE.Group();
        meshes.forEach(m => finalObject.add(m));
      }

      this.editor.execute(new AddObjectCommand(this.editor, finalObject));
    });

    reader.readAsText(file);
  }
}
