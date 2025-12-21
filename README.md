# Weblend

Weblend is a sophisticated web-based 3D modeling application inspired by professional desktop software. It allows users to create, manipulate, and edit 3D geometry directly in the browser using a modular and command-based architecture.

## 🚀 Features

### Core Modeling Tools
- **Mesh Editing:** Support for Extrude, Bevel, Knife, and Loop Cut tools.
- **Transformation:** Precise Translate, Rotate, and Scale operations.
- **Geometry Generation:** Built-in primitives and dynamic mesh data handling.
- **Selection Modes:** Vertex, Edge, and Face selection support.

### Modifier System
- **Non-Destructive Workflow:** Apply modifiers like **Mirror** and **Array** to create complex shapes efficiently.
- **Modifier Stack:** Manage and reorder modifiers to control the final output.

### User Interface
- **Modern Layout:** Includes a Toolbar, Sidebar for properties, and a Context Menu for quick actions.
- **Viewport Controls:** Navigation gizmos, orthographic views, and shading modes (Solid, Wireframe, Texture).
- **History System:** Complete Undo/Redo support via a command-based pattern.

### Import/Export
- Support for common 3D formats like **GLTF** and **OBJ**.

## 🛠️ Technology Stack
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Rendering:** WebGL-based engine.
- **Architecture:** Command Pattern for state management and modular UI components.

## 📦 Installation & Usage

1. **Clone the repository:**
   ```bash
   git clone https://github.com/wox76/weblend.git
   ```
2. **Open the project:**
   Simply open `index.html` in a modern web browser. No build step is required for the basic version.

## 📂 Project Structure
- `/js/core`: Core engine logic (Scene, Renderer, Camera).
- `/js/commands`: Implementation of the Undo/Redo system.
- `/js/tools`: Interactive modeling tools (Extrude, Bevel, etc.).
- `/js/modifiers`: Non-destructive geometry modifiers.
- `/js/ui`: Modular UI components.
- `/assets`: Icons, textures, and matcaps.

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
