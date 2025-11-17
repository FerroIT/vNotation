const state = {
    images: [],
    currentIndex: -1,
    annotations: {},
    drawing: false,
    startX: 0,
    startY: 0,
    currentBox: null,
    selectedAnnotation: null,
    classes: []
};

const elements = {
    canvas: document.getElementById('canvas'),
    dropZone: document.getElementById('dropZone'),
    imageList: document.getElementById('imageList'),
    classSelect: document.getElementById('classSelect'),
    classesTextarea: document.getElementById('classesTextarea'),
    clearBtn: document.getElementById('clearBtn'),
    exportBtn: document.getElementById('exportBtn'),
    imageName: document.getElementById('imageName'),
    imageIndex: document.getElementById('imageIndex'),
    dimensions: document.getElementById('dimensions'),
    annotationsList: document.getElementById('annotationsList')
};

const ctx = elements.canvas.getContext('2d');
const currentImage = new Image();

function getColorForClass(classId) {
    const colors = [
        '#e74c3c',
        '#3498db',
        '#2ecc71',
        '#f39c12',
        '#9b59b6',
        '#1abc9c',
        '#e67e22',
        '#34495e',
        '#16a085',
        '#c0392b',
        '#2980b9',
        '#8e44ad'
    ];
    return colors[classId % colors.length];
}

function setUIEnabled(enabled) {
    elements.dropZone.style.pointerEvents = enabled ? 'auto' : 'none';
    elements.dropZone.style.opacity = enabled ? '1' : '0.5';
    elements.classSelect.disabled = !enabled;
    elements.clearBtn.disabled = !enabled;
    elements.exportBtn.disabled = !enabled;
    elements.imageList.style.pointerEvents = enabled ? 'auto' : 'none';
    elements.imageList.style.opacity = enabled ? '1' : '0.5';
}

setUIEnabled(false);

elements.classesTextarea.addEventListener('input', () => {
    const text = elements.classesTextarea.value;
    state.classes = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    if (state.classes.length > 0) {
        elements.classSelect.innerHTML = '';
        state.classes.forEach((className, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = className;
            elements.classSelect.appendChild(option);
        });
        setUIEnabled(true);
    } else {
        elements.classSelect.innerHTML = '<option>Enter classes first</option>';
        setUIEnabled(false);
    }
});

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    
    const items = e.dataTransfer.items;
    const files = [];
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) await traverseFileTree(item, files);
    }
    
    state.images = files
        .filter(f => /\.(jpg|jpeg|png|bmp|gif)$/i.test(f.name))
        .sort((a, b) => a.name.localeCompare(b.name));
    
    if (state.images.length > 0) {
        renderImageList();
        loadImage(0);
    }
});

async function traverseFileTree(item, files) {
    if (item.isFile) {
        return new Promise((resolve) => {
            item.file((file) => {
                files.push(file);
                resolve();
            });
        });
    } else if (item.isDirectory) {
        const dirReader = item.createReader();
        const entries = await new Promise((resolve) => {
            dirReader.readEntries(resolve);
        });
        for (const entry of entries) {
            await traverseFileTree(entry, files);
        }
    }
}

function renderImageList() {
    elements.imageList.innerHTML = '';
    state.images.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = 'image-item';
        if (index === state.currentIndex) div.classList.add('active');
        if (state.annotations[img.name]?.length > 0) div.classList.add('annotated');
        div.textContent = img.name;
        div.onclick = () => loadImage(index);
        elements.imageList.appendChild(div);
    });
}

function loadImage(index) {
    if (index < 0 || index >= state.images.length) return;
    
    state.currentIndex = index;
    state.selectedAnnotation = null;
    const file = state.images[index];
    
    const reader = new FileReader();
    reader.onload = (e) => {
        currentImage.onload = () => {
            elements.canvas.width = currentImage.width;
            elements.canvas.height = currentImage.height;
            drawCanvas();
            
            elements.imageName.textContent = file.name;
            elements.imageIndex.textContent = `${index + 1} / ${state.images.length}`;
            elements.dimensions.textContent = `${currentImage.width}x${currentImage.height}`;
            
            renderImageList();
            renderAnnotations();
        };
        currentImage.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function drawCanvas() {
    ctx.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    ctx.drawImage(currentImage, 0, 0);
    
    const fileName = state.images[state.currentIndex]?.name;
    const boxes = state.annotations[fileName] || [];
    
    boxes.forEach((box, index) => {
        const isSelected = index === state.selectedAnnotation;
        const color = getColorForClass(box.class);
        ctx.strokeStyle = isSelected ? '#000000' : color;
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        const fontSize = Math.max(12, elements.canvas.width / 60);
        ctx.fillStyle = isSelected ? '#000000' : color;
        ctx.font = `${fontSize}px sans-serif`;
        const labelY = box.y > fontSize + 5 ? box.y - 5 : box.y + fontSize + 5;
        ctx.fillText(box.className || `${box.class}`, box.x, labelY);
    });
    
    if (state.currentBox) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(state.currentBox.x, state.currentBox.y, state.currentBox.width, state.currentBox.height);
        ctx.setLineDash([]);
    }
}

elements.canvas.addEventListener('mousedown', (e) => {
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const fileName = state.images[state.currentIndex]?.name;
    const boxes = state.annotations[fileName] || [];
    
    let clickedBox = -1;
    for (let i = boxes.length - 1; i >= 0; i--) {
        const box = boxes[i];
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) {
            clickedBox = i;
            break;
        }
    }
    
    if (clickedBox !== -1) {
        state.selectedAnnotation = clickedBox;
        renderAnnotations();
        drawCanvas();
    } else {
        state.drawing = true;
        state.startX = x;
        state.startY = y;
        state.selectedAnnotation = null;
        renderAnnotations();
    }
});

elements.canvas.addEventListener('mousemove', (e) => {
    if (!state.drawing) return;
    
    const rect = elements.canvas.getBoundingClientRect();
    const scaleX = elements.canvas.width / rect.width;
    const scaleY = elements.canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const width = x - state.startX;
    const height = y - state.startY;
    
    state.currentBox = {
        x: width < 0 ? x : state.startX,
        y: height < 0 ? y : state.startY,
        width: Math.abs(width),
        height: Math.abs(height)
    };
    
    drawCanvas();
});

elements.canvas.addEventListener('mouseup', () => {
    if (state.drawing && state.currentBox && state.currentBox.width > 5 && state.currentBox.height > 5) {
        const fileName = state.images[state.currentIndex]?.name;
        if (!state.annotations[fileName]) state.annotations[fileName] = [];
        
        const classId = parseInt(elements.classSelect.value);
        state.annotations[fileName].push({
            ...state.currentBox,
            class: classId,
            className: state.classes[classId]
        });
        
        renderAnnotations();
        renderImageList();
    }
    
    state.drawing = false;
    state.currentBox = null;
    drawCanvas();
});

elements.canvas.addEventListener('wheel', (e) => {
    if (state.classes.length === 0) return;
    
    e.preventDefault();
    const currentValue = parseInt(elements.classSelect.value);
    const newValue = e.deltaY < 0 
        ? (currentValue > 0 ? currentValue - 1 : state.classes.length - 1)
        : (currentValue < state.classes.length - 1 ? currentValue + 1 : 0);
    
    elements.classSelect.value = newValue;
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' && state.currentIndex < state.images.length - 1) {
        loadImage(state.currentIndex + 1);
    } else if (e.key === 'ArrowLeft' && state.currentIndex > 0) {
        loadImage(state.currentIndex - 1);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (state.selectedAnnotation !== null) {
            const fileName = state.images[state.currentIndex]?.name;
            if (state.annotations[fileName]) {
                state.annotations[fileName].splice(state.selectedAnnotation, 1);
                state.selectedAnnotation = null;
                renderAnnotations();
                renderImageList();
                drawCanvas();
            }
        }
    }
});

function renderAnnotations() {
    elements.annotationsList.innerHTML = '';
    const fileName = state.images[state.currentIndex]?.name;
    const boxes = state.annotations[fileName] || [];
    
    boxes.forEach((box, index) => {
        const div = document.createElement('div');
        div.className = 'annotation-item';
        if (index === state.selectedAnnotation) div.classList.add('selected');
        
        const centerX = ((box.x + box.width / 2) / elements.canvas.width).toFixed(3);
        const centerY = ((box.y + box.height / 2) / elements.canvas.height).toFixed(3);
        const width = (box.width / elements.canvas.width).toFixed(3);
        const height = (box.height / elements.canvas.height).toFixed(3);
        
        div.innerHTML = `<span>${box.className || box.class}</span><span>${centerX} ${centerY} ${width} ${height}</span>`;
        div.onclick = () => {
            state.selectedAnnotation = index;
            renderAnnotations();
            drawCanvas();
        };
        elements.annotationsList.appendChild(div);
    });
}

elements.clearBtn.addEventListener('click', () => {
    const fileName = state.images[state.currentIndex]?.name;
    if (fileName && confirm('Clear all annotations for this image?')) {
        state.annotations[fileName] = [];
        state.selectedAnnotation = null;
        renderAnnotations();
        renderImageList();
        drawCanvas();
    }
});

elements.exportBtn.addEventListener('click', async () => {
    if (state.images.length === 0) return alert('No images loaded');
    if (state.classes.length === 0) return alert('Please enter classes first');
    
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    const imagesFolder = zip.folder('images');
    const labelsFolder = zip.folder('labels');
    
    for (const file of state.images) {
        imagesFolder.file(file.name, file);
        
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const boxes = state.annotations[file.name] || [];
        
        const yoloLines = boxes.map(box => {
            const centerX = (box.x + box.width / 2) / elements.canvas.width;
            const centerY = (box.y + box.height / 2) / elements.canvas.height;
            const width = box.width / elements.canvas.width;
            const height = box.height / elements.canvas.height;
            return `${box.class} ${centerX} ${centerY} ${width} ${height}`;
        }).join('\n');
        
        labelsFolder.file(`${baseName}.txt`, yoloLines);
    }
    
    zip.file('classes.txt', state.classes.join('\n'));
    
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yolo_dataset.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

async function loadJSZip() {
    if (window.JSZip) return window.JSZip;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve(window.JSZip);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
