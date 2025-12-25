import { Vector2, Vector3, Quaternion, Box3, Sphere } from 'three';

export class QuaternionOrbitControls {
	constructor(camera, domElement, target = new Vector3()) {
		this.camera = camera;
		this.domElement = domElement;
		this.target = target;
		this.enabled = true;

		this.moveCurr = new Vector2();
		this.movePrev = new Vector2();

		this.rotateSpeed = 3.5;
		this.zoomSpeed = 2.0;
		this.panSpeed = 0.8;

		this.eye = new Vector3();

		this._state = null;

		this.domElement.style.touchAction = 'none'; // Disable browser touch handling
		this._bindEvents();
	}

  setCamera(camera) {
    this.camera = camera;
  }

	_bindEvents() {
		this.domElement.addEventListener('mousedown', this._onMouseDown.bind(this));
		this.domElement.addEventListener('wheel', this._onMouseWheel.bind(this));

		this.domElement.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
		this.domElement.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
		this.domElement.addEventListener('touchend', this._onTouchEnd.bind(this), { passive: false });
	}

	_getMouseOnCircle(x, y) {
		const rect = this.domElement.getBoundingClientRect();
		return new Vector2(
			((x - rect.left) / rect.width) * 2 - 1,
			-((y - rect.top) / rect.height) * 2 + 1
		);
	}

	_onMouseDown(event) {
		if (!this.enabled || event.button !== 1) return;

		this.movePrev.copy(this._getMouseOnCircle(event.clientX, event.clientY));

		if (event.shiftKey) {
			this._state = 'pan';
		} else {
			this._state = 'orbit';
		}

		const onMouseMove = (event) => {
			this.moveCurr.copy(this._getMouseOnCircle(event.clientX, event.clientY));

			if (this._state === 'orbit') {
				this._rotateCamera();
			} else if (this._state === 'pan') {
				this._panCamera();

                // Add simultaneous zoom when panning with SHIFT
                const moveDeltaY = this.moveCurr.y - this.movePrev.y;
                if (Math.abs(moveDeltaY) > 0) {
                    const zoomFactor = 1 + moveDeltaY * this.zoomSpeed * 0.5;
                    this._performZoom(zoomFactor);
                }
			}

			this.movePrev.copy(this.moveCurr);
		};

		const onMouseUp = () => {
			window.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('mouseup', onMouseUp);
			this._state = null;
		};

		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', onMouseUp);
	}

	_onMouseWheel(event) {
		if (!this.enabled) return;
		event.preventDefault();

		const delta = event.deltaY > 0 ? 1 : -1;
		const factor = 1 + delta * 0.1 * this.zoomSpeed;
		this._performZoom(factor);
	}

	_performZoom(factor) {
		this.eye.subVectors(this.camera.position, this.target);
		this.eye.multiplyScalar(factor);
		this.camera.position.copy(this.target).add(this.eye);
		this.camera.lookAt(this.target);
	}

	_onTouchStart(event) {
		if (!this.enabled) return;

		if (event.touches.length === 2) {
			this._state = 'touch-multi';
			this._touchType = null;
			
			const center = this._getTouchCenter(event.touches);
			this.movePrev.copy(this._getMouseOnCircle(center.x, center.y));
            this._touchStartCenter = center;

			const dx = event.touches[0].clientX - event.touches[1].clientX;
			const dy = event.touches[0].clientY - event.touches[1].clientY;
			this._touchPrevDist = Math.sqrt(dx * dx + dy * dy);
            this._touchStartDist = this._touchPrevDist;
		} else if (event.touches.length === 3) {
            this._state = 'pan';
            const center = this._getTouchCenter(event.touches);
            this.movePrev.copy(this._getMouseOnCircle(center.x, center.y));
        }
	}

	_onTouchMove(event) {
		if (!this.enabled) return;
        // 1 finger does nothing (allows selection/tools interaction)

		if (event.touches.length === 2 && this._state === 'touch-multi') {
            event.preventDefault();
			const center = this._getTouchCenter(event.touches);
            const dx = event.touches[0].clientX - event.touches[1].clientX;
			const dy = event.touches[0].clientY - event.touches[1].clientY;
			const dist = Math.sqrt(dx * dx + dy * dy);

            if (!this._touchType) {
                const distChange = Math.abs(dist - this._touchStartDist);
                const panChange = Math.sqrt(Math.pow(center.x - this._touchStartCenter.x, 2) + Math.pow(center.y - this._touchStartCenter.y, 2));
                const threshold = 5;

                if (distChange > threshold || panChange > threshold) {
                    if (distChange > panChange) {
                        this._touchType = 'zoom';
                    } else {
                        this._touchType = 'orbit'; // 2 fingers move together -> Rotate
                    }
                }
            }

            if (this._touchType === 'orbit') {
                this.moveCurr.copy(this._getMouseOnCircle(center.x, center.y));
			    this._rotateCamera();
			    this.movePrev.copy(this.moveCurr);
                this._touchPrevDist = dist; 
            } else if (this._touchType === 'zoom') {
                if (this._touchPrevDist > 0) {
				    const factor = this._touchPrevDist / dist;
				    this._performZoom(factor);
			    }
			    this._touchPrevDist = dist;
                this.movePrev.copy(this._getMouseOnCircle(center.x, center.y));
            }
		} else if (event.touches.length === 3 && this._state === 'pan') {
            event.preventDefault();
            const center = this._getTouchCenter(event.touches);
            this.moveCurr.copy(this._getMouseOnCircle(center.x, center.y));
            this._panCamera();
            this.movePrev.copy(this.moveCurr);
        }
	}

    _onTouchEnd(event) {
        if (event.touches.length < 2) {
             this._state = null;
        }
    }

	_getTouchCenter(touches) {
        let x = 0, y = 0;
        for (let i = 0; i < touches.length; i++) {
            x += touches[i].clientX;
            y += touches[i].clientY;
        }
		return {
			x: x / touches.length,
			y: y / touches.length
		};
	}

	_panCamera() {
		const moveDelta = new Vector2().subVectors(this.moveCurr, this.movePrev);
		if (moveDelta.lengthSq() === 0) return;
		
		this.eye.subVectors(this.camera.position, this.target);
		const eyeLength = this.eye.length();

		const eyeDirection = this.eye.clone().normalize();
		const cameraUp = this.camera.up.clone().normalize();
		const right = new Vector3().crossVectors(cameraUp, eyeDirection).normalize();

		const panX = -moveDelta.x * eyeLength * this.panSpeed;
		const panY = -moveDelta.y * eyeLength * this.panSpeed;

		const panOffset = new Vector3().addScaledVector(right, panX).addScaledVector(cameraUp, panY);

		this.camera.position.add(panOffset);
		this.target.add(panOffset);
		this.camera.lookAt(this.target);
	}

	_rotateCamera() {
		this.eye.subVectors(this.camera.position, this.target);

		const moveDelta = new Vector2().subVectors(this.moveCurr, this.movePrev);
		if (moveDelta.lengthSq() === 0) return;

    const angleYaw = -moveDelta.x * this.rotateSpeed;
    const anglePitch = moveDelta.y * this.rotateSpeed;

		const eyeDirection = this.eye.clone().normalize();
		const upDirection = this.camera.up.clone().normalize();
    const worldYAxis = new Vector3(0, 1, 0);
		const worldUp = worldYAxis.clone().multiplyScalar(upDirection.dot(worldYAxis)).normalize();

		const rightDirection = new Vector3().crossVectors(upDirection, eyeDirection).normalize();

    // Create pitch quaternion around right dicrection
    const quatPitch = new Quaternion().setFromAxisAngle(rightDirection, anglePitch);

    // Create yaw quaternion around world up
    const quatYaw = new Quaternion().setFromAxisAngle(worldUp, angleYaw);

    const combinedQuat = new Quaternion().multiplyQuaternions(quatYaw, quatPitch);

    this.eye.applyQuaternion(combinedQuat);
    this.camera.up.applyQuaternion(combinedQuat);

    this.camera.position.copy(this.target).add(this.eye);
    this.camera.lookAt(this.target);

    this.movePrev.copy(this.moveCurr);
	}

	_focus(targetObjects) {
		const box = new Box3();
		const sphere = new Sphere();

		const objects = Array.isArray(targetObjects) ? targetObjects : [targetObjects];
		if (objects.length === 0) return;
		objects.forEach(obj => {box.expandByObject(obj)});

		let distance;

		if (!box.isEmpty()) {
			box.getCenter(this.target);
			box.getBoundingSphere(sphere);
			distance = sphere.radius;
		} else {
			objects[0].getWorldPosition(this.target);
			distance = 0.5;
		}

		this.eye.set(0, 0, 1);
		this.eye.applyQuaternion(this.camera.quaternion);
		this.eye.multiplyScalar(distance * 4);

		this.camera.position.copy(this.target).add(this.eye);
		this.camera.lookAt(this.target);
	}
}