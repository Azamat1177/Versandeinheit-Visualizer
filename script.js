// --- 1. GLOBALE KONSTANTEN & DATENSTRUKTUREN ---
let itemData = {};
let articlesToLoad = []; 
const CSV_FILE_PATH = '111stammdaten.csv';

// Maximale Paletten-Dimensionen (Hardcoded Logik für Kapazitätsprüfung)
const MAX_PALETTE_L = 240; 
const MAX_PALETTE_B = 240; 
const MAX_PALETTE_H = 220; 

// Three.js Konstanten
let scene, camera, renderer, controls;
const container = document.getElementById('visualizer');
const SCALE_FACTOR = 100; // 1 Einheit in Three.js = 100cm (Meter)


// --- 2. CSV LADEN UND PARSEN ---

async function loadAndParseCSV() {
    try {
        const response = await fetch(CSV_FILE_PATH);
        if (!response.ok) {
             throw new Error(`Konnte CSV-Datei nicht laden.`);
        }
        
        const csvText = await response.text();
        const lines = csvText.trim().split('\n');
        
        const headers = lines[0].split(';').map(h => h.trim()); 
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(';'); 
            if (values.length !== headers.length) continue; 

            const item = {
                'Artikel-Nr': values[0].trim(), 
                'Name': values[1].trim(),       
                'L': parseFloat(values[2].trim().replace(',', '.')),
                'B': parseFloat(values[3].trim().replace(',', '.')),
                'H': parseFloat(values[4].trim().replace(',', '.')),
                'Gewicht': parseFloat(values[5].trim().replace(',', '.')),
                'color': parseInt(values[6].trim(), 16) 
            };
            
            if (isNaN(item.L) || isNaN(item.B) || isNaN(item.H)) {
                console.warn(`Fehlerhafte numerische Daten in Artikel ${item['Artikel-Nr']}. Übersprungen.`);
                continue; 
            }

            const artNr = item['Artikel-Nr'];
            if (!itemData[artNr]) {
                itemData[artNr] = [];
            }
            itemData[artNr].push(item);
        }

        if (!itemData['PAL-EU'] || itemData['PAL-EU'].length === 0) {
            throw new Error("PAL-EU nicht in den geladenen Stammdaten gefunden.");
        }

        initThreeJs();
        updateLoadList();
        visualizePackage(); 
        
    } catch (error) {
        console.error("Fehler beim Laden/Parsen der CSV-Daten:", error);
        alert("Fehler beim Laden der CSV-Daten. Prüfen Sie die Konsolenausgabe und den Server-Status.");
    }
}


// --- 3. ARTIKEL-SUCHE UND UI-LOGIK ---

function findArticleData(inputNr) {
    if (itemData[inputNr]) {
        return itemData[inputNr];
    }
    
    const normalizedInput = inputNr.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    for (const key in itemData) {
        if (itemData.hasOwnProperty(key)) {
            const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            
            if (normalizedKey === normalizedInput) {
                return itemData[key];
            }
        }
    }
    return null;
}

// Synchronisierung von Farbwählern
window.syncColorInput = function(val) {
    document.getElementById('colorTextInput').value = val.substring(1).toUpperCase();
};

window.syncColorText = function(val) {
    if (val.match(/^[0-9a-fA-F]{6}$/)) {
        document.getElementById('colorInput').value = '#' + val;
    }
};

// Stammdaten-Suche & Autocomplete
window.handleArticleSearch = function() {
    const inputVal = document.getElementById('articleInput').value.trim();
    const suggestionsContainer = document.getElementById('search-suggestions');
    
    suggestionsContainer.classList.add('hidden');
    suggestionsContainer.innerHTML = '';
    
    if (inputVal.length < 2) {
        return;
    }
    
    const matches = [];
    const normalizedInput = inputVal.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    
    for (const key in itemData) {
        if (itemData.hasOwnProperty(key)) {
            const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
            const items = itemData[key];
            
            const nameMatch = items.some(item => 
                item.Name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '').includes(normalizedInput)
            );
            
            if (normalizedKey.includes(normalizedInput) || nameMatch) {
                matches.push({ key, items });
            }
        }
    }
    
    if (matches.length === 0) {
        return;
    }
    
    suggestionsContainer.classList.remove('hidden');
    
    matches.slice(0, 10).forEach(match => {
        const itemRepresentative = match.items[0];
        const hasDuplicates = match.items.length > 1;
        
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
            <div>
                <span class="item-nr">${itemRepresentative['Artikel-Nr']}</span> 
                <span>${itemRepresentative.Name.substring(0, 45)}${itemRepresentative.Name.length > 45 ? '...' : ''}</span>
                ${hasDuplicates ? ` <span style="font-size:0.8em; color:#dd6b20; font-weight:bold;">(${match.items.length} Varianten)</span>` : ''}
            </div>
            <span class="item-dims">${itemRepresentative.L}x${itemRepresentative.B}x${itemRepresentative.H} cm</span>
        `;
        
        div.onclick = function() {
            selectArticleKey(match.key);
            suggestionsContainer.classList.add('hidden');
        };
        suggestionsContainer.appendChild(div);
    });
};

// Schließen der Vorschläge beim Klick außerhalb
document.addEventListener('click', function(e) {
    const container = document.getElementById('search-suggestions');
    const input = document.getElementById('articleInput');
    if (container && e.target !== container && e.target !== input) {
        container.classList.add('hidden');
    }
});

// Artikelvariante oder Einzelartikel auswählen
window.selectArticleKey = function(key) {
    const items = itemData[key];
    const duplicateSelector = document.getElementById('duplicate-selector-container');
    const duplicateOptions = document.getElementById('duplicate-options');
    
    if (!items || items.length === 0) return;
    
    if (items.length === 1) {
        duplicateSelector.classList.add('hidden');
        prefillForm(items[0]);
    } else {
        duplicateSelector.classList.remove('hidden');
        duplicateOptions.innerHTML = '';
        
        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'duplicate-card';
            const dims = `${item.L}x${item.B}x${item.H} cm | ${item.Gewicht} kg`;
            
            card.innerHTML = `
                <span class="card-name">${item.Name}</span>
                <span class="card-details">${dims}</span>
            `;
            
            card.onclick = function() {
                prefillForm(item);
                duplicateSelector.classList.add('hidden');
            };
            
            duplicateOptions.appendChild(card);
        });
    }
};

// Formular mit Artikeldaten ausfüllen
window.prefillForm = function(item) {
    document.getElementById('articleNrInput').value = item['Artikel-Nr'];
    document.getElementById('articleNameInput').value = item.Name;
    document.getElementById('lengthInput').value = item.L;
    document.getElementById('widthInput').value = item.B;
    document.getElementById('heightInput').value = item.H;
    document.getElementById('weightInput').value = item.Gewicht;
    
    let hexColor = item.color.toString(16).toUpperCase();
    while (hexColor.length < 6) {
        hexColor = '0' + hexColor;
    }
    
    document.getElementById('colorTextInput').value = hexColor;
    document.getElementById('colorInput').value = '#' + hexColor;
    document.getElementById('articleInput').value = '';
};

function updateLoadList() {
    const listContainer = document.getElementById('currentLoadList');
    listContainer.innerHTML = ''; 

    if (articlesToLoad.length === 0) {
        listContainer.innerHTML = '<li class="note-list">Noch keine Artikel hinzugefügt.</li>';
        return;
    }

    articlesToLoad.forEach((entry, index) => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `${entry.quantity}x <strong>${entry.item.Name}</strong> (${entry.item['Artikel-Nr']}) 
                              <button onclick="removeLoadItem(${index})">X</button>`;
        listContainer.appendChild(listItem);
    });
}

window.addToLoad = function() {
    const articleNr = document.getElementById('articleNrInput').value.trim();
    const name = document.getElementById('articleNameInput').value.trim();
    const length = parseFloat(document.getElementById('lengthInput').value);
    const width = parseFloat(document.getElementById('widthInput').value);
    const height = parseFloat(document.getElementById('heightInput').value);
    const weight = parseFloat(document.getElementById('weightInput').value);
    const colorHex = document.getElementById('colorTextInput').value.trim();
    let quantity = parseInt(document.getElementById('quantityInput').value, 10);

    if (!articleNr || !name || isNaN(length) || isNaN(width) || isNaN(height) || isNaN(weight) || isNaN(quantity) || quantity <= 0) {
        alert("Bitte befüllen Sie alle Felder mit gültigen Werten.");
        return;
    }

    if (articleNr === 'PAL-EU') {
        alert("Die Artikelnummer darf nicht 'PAL-EU' sein.");
        return;
    }

    const color = parseInt(colorHex, 16);

    const item = {
        'Artikel-Nr': articleNr,
        'Name': name,
        'L': length,
        'B': width,
        'H': height,
        'Gewicht': weight,
        'color': isNaN(color) ? 0x007bff : color
    };

    articlesToLoad.push({ item, quantity });
    updateLoadList();
    
    // Formular zurücksetzen (außer dem Suchfeld)
    document.getElementById('articleNrInput').value = '';
    document.getElementById('articleNameInput').value = '';
    document.getElementById('lengthInput').value = '';
    document.getElementById('widthInput').value = '';
    document.getElementById('heightInput').value = '';
    document.getElementById('weightInput').value = '';
    document.getElementById('colorTextInput').value = '007BFF';
    document.getElementById('colorInput').value = '#007bff';
    document.getElementById('quantityInput').value = '1';
    
    visualizePackage();
}

window.clearLoad = function() {
    articlesToLoad = [];
    updateLoadList();
    clearScene(); 
    visualizePackage(); 
}

window.removeLoadItem = function(index) {
    articlesToLoad.splice(index, 1);
    updateLoadList();
    visualizePackage(); 
}


// --- 4. THREE.JS BASICS & HILFSFUNKTIONEN ---

function initThreeJs() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf4f7fa); 

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(2, 2, 2); 

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    initLights();

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; 
    
    animate();
}

function initLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.5)); 
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); 
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    if (container.clientWidth > 0 && container.clientHeight > 0) {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
});

function clearScene() {
    const objectsToRemove = scene.children.filter(obj => 
        obj.type === 'Mesh' || 
        obj.type === 'Line' || 
        obj.type === 'Sprite' || 
        obj.type === 'Group'
    );
    objectsToRemove.forEach(obj => scene.remove(obj));
}

function getContrastColor(hexColor) {
    const r = (hexColor >> 16) & 255;
    const g = (hexColor >> 8) & 255;
    const b = hexColor & 255;
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

function createBoxTexture(data) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Farbe konvertieren
    let hexColor = data.color.toString(16).toUpperCase();
    while (hexColor.length < 6) {
        hexColor = '0' + hexColor;
    }
    const bgColor = '#' + hexColor;
    const textColor = getContrastColor(data.color);

    // Hintergrund füllen
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Hochkontrast-Rahmen
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 16;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);

    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 1. Artikel-Nr
    ctx.font = 'bold 50px Arial, sans-serif';
    ctx.fillText(data['Artikel-Nr'] || '', 256, 110);

    // 2. Name
    ctx.font = '32px Arial, sans-serif';
    let displayName = data.Name || '';
    if (displayName.length > 22) {
        displayName = displayName.substring(0, 20) + '...';
    }
    ctx.fillText(displayName, 256, 200);

    // 3. Maße (z.B. 120,0 x 80,0 x 60,0 cm)
    ctx.font = 'bold 36px Arial, sans-serif';
    const dimsText = `${data.L.toFixed(1).replace('.', ',')}x${data.B.toFixed(1).replace('.', ',')}x${data.H.toFixed(1).replace('.', ',')} cm`;
    ctx.fillText(dimsText, 256, 310);

    // 4. Gewicht
    ctx.font = '34px Arial, sans-serif';
    const weightText = `${data.Gewicht.toFixed(1).replace('.', ',')} kg`;
    ctx.fillText(weightText, 256, 410);

    const texture = new THREE.CanvasTexture(canvas);
    return texture;
}

function drawBox(data, positionY, positionX = 0, positionZ = 0) {
    const l = data.L / SCALE_FACTOR;
    const b = data.B / SCALE_FACTOR;
    const h = data.H / SCALE_FACTOR;
    
    const geometry = new THREE.BoxGeometry(l, h, b);
    
    // Canvas-Textur für Textlabel auf allen Seiten erstellen
    const texture = createBoxTexture(data);
    const material = new THREE.MeshStandardMaterial({ 
        map: texture,
        roughness: 0.4,
        metalness: 0.1
    });
    
    const box = new THREE.Mesh(geometry, material);
    box.position.set(positionX, positionY + (h / 2), positionZ); 
    
    // Kanten für bessere Unterscheidbarkeit hinzufügen
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMat = new THREE.LineBasicMaterial({ 
        color: getContrastColor(data.color) === '#ffffff' ? 0x000000 : 0x888888, 
        linewidth: 1.5 
    });
    const line = new THREE.LineSegments(edges, lineMat);
    box.add(line);
    
    scene.add(box);
    return box;
}

function drawPalletRealistic(data, positionY, positionX = 0, positionZ = 0) {
    const l = data.L / SCALE_FACTOR; 
    const b = data.B / SCALE_FACTOR; 
    const h = data.H / SCALE_FACTOR; 
    const color = data.color;

    const group = new THREE.Group();
    group.position.set(positionX, positionY, positionZ);
    
    const material = new THREE.MeshStandardMaterial({ color: color });

    const boardH = h / 4;
    const boardL = l;
    const boardB = b / 6; 
    const zPositions = [-b / 2 + boardB / 2, 0, b / 2 - boardB / 2];

    zPositions.forEach(z => {
        const geometry = new THREE.BoxGeometry(boardL, boardH, boardB);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(0, h - boardH / 2, z); 
        group.add(mesh);
    });

    const blockH = h * 0.7;
    const blockSide = l / 5; 
    const xPositions = [-l / 2 + blockSide / 2, 0, l / 2 - blockSide / 2];
    
    xPositions.forEach(x => {
        const geometry = new THREE.BoxGeometry(blockSide, blockH, b);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, blockH / 2, 0);
        group.add(mesh);
    });

    scene.add(group);
    return group;
}


// --- 5. LOGIK FÜR STAPELUNG & MULTI-PALETTEN ---

function createNewPallet(id, paletteBase, lastPallet = null) {
    const pal_L = paletteBase.L;
    const pal_B = paletteBase.B;
    
    const offset = lastPallet ? lastPallet.drawingOffsetX + (pal_L / SCALE_FACTOR) * 1.5 : 0;
    
    return {
        id: id,
        currentH: paletteBase.H,
        items: [],
        drawingOffsetX: offset, 
        drawingOffsetZ: 0,
        
        xCursor: -pal_L / 2, 
        zCursor: -pal_B / 2,
        maxZInRow: -pal_B / 2,
        
        maxL: pal_L, 
        maxB: pal_B,
        
        isLayerFull: false, 
        layerHeight: 0, 
    };
}

window.visualizePackage = function() {
    if (Object.keys(itemData).length === 0) return;

    const paletteBase = itemData['PAL-EU'][0];
    const pal_L = paletteBase.L;
    const pal_B = paletteBase.B;
    
    clearScene();

    // Warnungs-Prüfung & Details sammeln
    let hasSpecialPalette = false;
    let specialPaletteItems = [];

    articlesToLoad.forEach(entry => {
        const item = entry.item;
        let isSpecial = false;
        let reasons = [];

        if (item.L > 240) {
            isSpecial = true;
            reasons.push(`Länge (${item.L} cm) überschreitet max. 240 cm`);
        }
        if (item.B > 240) {
            isSpecial = true;
            reasons.push(`Breite (${item.B} cm) überschreitet max. 240 cm`);
        }
        if (item.H > 220) {
            isSpecial = true;
            reasons.push(`Höhe (${item.H} cm) überschreitet max. 220 cm`);
        }
        if (item.L > 120 && item.B > 120) {
            isSpecial = true;
            reasons.push(`Überbreite auf beiden Seiten (${item.L}x${item.B} cm)`);
        }

        if (isSpecial) {
            hasSpecialPalette = true;
            specialPaletteItems.push({
                nr: item['Artikel-Nr'],
                name: item.Name,
                dims: `${item.L}x${item.B}x${item.H} cm`,
                reasons: reasons
            });
        }
    });

    const alertBox = document.getElementById('sonderpalette-alert');
    const alertDetails = document.getElementById('sonderpalette-details');
    
    if (hasSpecialPalette) {
        alertBox.classList.remove('hidden');
        alertDetails.innerHTML = '';
        
        const uniqueSpecial = [];
        const seen = new Set();
        specialPaletteItems.forEach(spi => {
            if (!seen.has(spi.nr)) {
                seen.add(spi.nr);
                uniqueSpecial.push(spi);
            }
        });
        
        uniqueSpecial.forEach(spi => {
            const li = document.createElement('li');
            li.innerHTML = `<strong>${spi.nr} (${spi.name}):</strong> ${spi.reasons.join(', ')}`;
            alertDetails.appendChild(li);
        });
    } else {
        alertBox.classList.add('hidden');
    }

    if (articlesToLoad.length === 0) {
        drawPalletRealistic(paletteBase, 0, 0, 0);
        document.getElementById('stat-l').innerText = `${pal_L} cm`;
        document.getElementById('stat-b').innerText = `${pal_B} cm`;
        document.getElementById('stat-h').innerText = `${paletteBase.H.toFixed(1)} cm`;
        document.getElementById('stat-weight').innerText = `${paletteBase.Gewicht.toFixed(1)} kg (Leer)`;
        if (document.getElementById('stat-ldm')) {
            document.getElementById('stat-ldm').innerText = '0.00 LDM';
        }
        document.getElementById('palletContent').innerHTML = '<p class="note">Keine Ladung vorhanden.</p>';
        return;
    }

    let pallets = [];
    pallets.push(createNewPallet(1, paletteBase));

    let allItems = [];
    articlesToLoad.forEach(entry => {
        for(let q = 0; q < entry.quantity; q++) {
            allItems.push(entry.item);
        }
    });

    for (let i = 0; i < allItems.length; i++) {
        const item = allItems[i];
        let placed = false;
        
        let currentPallet = pallets[pallets.length - 1];

        while(!placed) {
            
            let nextStackHeight = currentPallet.currentH; 
            if (currentPallet.isLayerFull) {
                nextStackHeight = currentPallet.currentH + currentPallet.layerHeight;
            }
            
            const heightOkay = nextStackHeight + item.H <= MAX_PALETTE_H;
            
            const newMaxL = Math.max(currentPallet.maxL, item.L);
            const newMaxB = Math.max(currentPallet.maxB, item.B);
            const maxDimensionOkay = newMaxL <= MAX_PALETTE_L && newMaxB <= MAX_PALETTE_B;
            
            // Wenn der Artikel größer als die Standardpalette ist und die Palette bereits Artikel enthält,
            // weichen wir sofort auf eine neue Palette aus, um Endlosschleifen zu verhindern.
            if ((item.L > pal_L || item.B > pal_B) && currentPallet.items.length > 0) {
                break;
            }
            
            // 1. PALETTE IST LEER (Bündiges Laden ab Ecke für korrekte Stapelung)
            if (currentPallet.items.length === 0) {
                // Ein übergroßer Artikel wird immer auf einer neuen leeren Palette platziert.
                // Dadurch verhindern wir Endlosschleifen im Algorithmus bei Sonderpaletten-Größen.
                const posL = -pal_L / 2 + item.L / 2;
                const posZ = -pal_B / 2 + item.B / 2;
                currentPallet.items.push({ item, posL, posZ, posH: currentPallet.currentH });
                currentPallet.layerHeight = item.H;
                currentPallet.maxL = newMaxL;
                currentPallet.maxB = newMaxB;
                currentPallet.xCursor = -pal_L / 2 + item.L;
                currentPallet.maxZInRow = -pal_B / 2 + item.B;
                placed = true;
                currentPallet.isLayerFull = false; 
            } 
            // 2. PALETTE WIRD GEFÜLLT (Basisfläche / Schicht)
            else if (!currentPallet.isLayerFull) {

                const remainingL = (pal_L / 2) - currentPallet.xCursor; 
                const fitsInCurrentRow = item.L <= remainingL;
                
                const remainingB = (pal_B / 2) - currentPallet.maxZInRow;
                const fitsInNewRow = item.B <= remainingB;

                if (fitsInCurrentRow) {
                    // 1a. PLATZIERUNG IN AKTUELLE REIHE
                    const posL = currentPallet.xCursor + (item.L / 2); 
                    const posZ = currentPallet.zCursor + (item.B / 2); 

                    // Overhang-Check: Prüfung gegen 240/160
                    const currentMaxL = Math.max(currentPallet.maxL, pal_L/2 + posL + item.L/2);
                    const currentMaxB = Math.max(currentPallet.maxB, pal_B/2 + posZ + item.B/2);
                    
                    if(currentMaxL > MAX_PALETTE_L || currentMaxB > MAX_PALETTE_B) {
                        break; 
                    }
                    
                    currentPallet.items.push({ item, posL, posZ, posH: currentPallet.currentH });
                    
                    currentPallet.xCursor += item.L;
                    currentPallet.maxZInRow = Math.max(currentPallet.maxZInRow, currentPallet.zCursor + item.B);
                    currentPallet.maxL = currentMaxL; 
                    currentPallet.maxB = currentMaxB;
                    placed = true;
                    
                } else if (fitsInNewRow && currentPallet.xCursor > -pal_L / 2) {
                    // 2a. NEUE REIHE STARTEN (nur wenn wir nicht schon am Zeilenanfang stehen)
                    currentPallet.zCursor = currentPallet.maxZInRow; 
                    currentPallet.xCursor = -pal_L / 2; 
                    
                } else {
                    // 3a. BASIFLÄCHE DER AKTUELLEN SCHICHT IST VOLL
                    currentPallet.isLayerFull = true;
                }
            } 
            // 3. Wenn die Palette voll ist (Höhe reicht nicht)
            else {
                // HÖHEN-PRIORITÄTS-LOGIK: Stapelung erzwingen
                if (heightOkay) {
                    currentPallet.isLayerFull = true;
                    currentPallet.currentH += currentPallet.layerHeight; 
                    
                    currentPallet.xCursor = -pal_L / 2; 
                    currentPallet.zCursor = -pal_B / 2;
                    currentPallet.maxZInRow = -pal_B / 2;
                    currentPallet.layerHeight = item.H; 
                    currentPallet.isLayerFull = false;
                    
                } else {
                    break; // Weder Basis noch Stapelung möglich -> Neue Palette
                }
            }
        }
        
        // Wenn der Artikel am Ende des Loops nicht platziert wurde, neue Palette starten
        if (!placed) {
            let lastPallet = pallets[pallets.length - 1];
            currentPallet = createNewPallet(pallets.length + 1, paletteBase, lastPallet);
            pallets.push(currentPallet);
            i--; // Artikel muss erneut geladen werden
        }
    }
    
    // Dynamische Anpassung: Wenn eine Palette nur genau ein Element enthält, platzieren wir dieses mittig.
    // Sobald mehr als ein Element geladen ist, bleibt die platzsparende Eck-Stapelung bestehen.
    pallets.forEach(pallet => {
        if (pallet.items.length === 1) {
            pallet.items[0].posL = 0;
            pallet.items[0].posZ = 0;
        }
    });

    // Dynamische Abstände berechnen, um Überlappungen bei Übergrößen/Sonderpaletten zu verhindern
    const GAP_WIDTH = 40; // 40 cm Sicherheitsabstand zwischen den Ladegütern benachbarter Paletten
    
    pallets.forEach(pallet => {
        let minX = -pal_L / 2;
        let maxX = pal_L / 2;
        pallet.items.forEach(pi => {
            minX = Math.min(minX, pi.posL - pi.item.L / 2);
            maxX = Math.max(maxX, pi.posL + pi.item.L / 2);
        });
        pallet.localMinX = minX;
        pallet.localMaxX = maxX;
    });

    pallets.forEach((pallet, index) => {
        if (index === 0) {
            // Erste Palette startet so, dass ihr Inhalt genau ab X=0 beginnt
            pallet.drawingOffsetX = -pallet.localMinX / SCALE_FACTOR;
        } else {
            const prevPallet = pallets[index - 1];
            const prevGlobalMaxX = prevPallet.drawingOffsetX * SCALE_FACTOR + prevPallet.localMaxX;
            // Der globale linke Rand des neuen Paletteninhalts soll bei prevGlobalMaxX + GAP_WIDTH liegen
            pallet.drawingOffsetX = (prevGlobalMaxX - pallet.localMinX + GAP_WIDTH) / SCALE_FACTOR;
        }
    });
    
    // --- 7. RENDERING & DATEN-AGGREGATION ---
    let overallMaxH = 0;
    let totalOverallWeight = 0;
    let totalOverallLDM = 0;
    
    pallets.forEach(pallet => {
        const pL_scaled = pal_L / SCALE_FACTOR;
        const pB_scaled = pal_B / SCALE_FACTOR;
        const offsetX = pallet.drawingOffsetX;
        const offsetZ = pallet.drawingOffsetZ;
        
        drawPalletRealistic(paletteBase, 0, offsetX, offsetZ); 

        let palletTotalWeight = paletteBase.Gewicht;
        let palletMaxH = paletteBase.H;
        
        pallet.items.forEach(pItem => {
            const h_scaled = pItem.posH / SCALE_FACTOR;
            const l_scaled = pItem.posL / SCALE_FACTOR;
            const z_scaled = pItem.posZ / SCALE_FACTOR;

            drawBox(pItem.item, h_scaled, pItem.posL / SCALE_FACTOR + offsetX, pItem.posZ / SCALE_FACTOR + offsetZ);
            
            palletTotalWeight += pItem.item.Gewicht;
            palletMaxH = Math.max(palletMaxH, pItem.posH + pItem.item.H);
        });
        
        pallet.finalWeight = palletTotalWeight;
        pallet.finalHeight = palletMaxH;
        totalOverallWeight += palletTotalWeight;
        overallMaxH = Math.max(overallMaxH, palletMaxH);

        // Lademeter-Berechnung für diese Palette
        let isPalletSpecial = false;
        pallet.items.forEach(pItem => {
            const item = pItem.item;
            if (item.L > 240 || item.B > 240 || item.H > 220 || (item.L > 120 && item.B > 120)) {
                isPalletSpecial = true;
            }
        });

        let palletLDM = 0.4; // Standard Europalette = 0.4 LDM
        if (isPalletSpecial) {
            // Logistische LDM Flächen-Formel für Sonderpaletten
            palletLDM = Math.max(0.4, (pallet.maxL * pallet.maxB) / 24000);
        }
        pallet.ldm = palletLDM;
        totalOverallLDM += palletLDM;
    });

    // --- 8. STATISTIKEN & KAMERA ---

    const overallMaxH_scaled = overallMaxH / SCALE_FACTOR;

    const finalL = pallets.reduce((max, p) => Math.max(max, p.maxL), pal_L);
    const finalB = pallets.reduce((max, p) => Math.max(max, p.maxB), pal_B);

    // Globale Daten für Ladekarte speichern
    currentPallets = pallets;
    currentTotalWeight = totalOverallWeight;
    currentTotalLDM = totalOverallLDM;
    currentOverallMaxH = overallMaxH;
    currentFinalL = finalL;
    currentFinalB = finalB;

    displaySidebar(pallets);
    
    const finalWidthScaled = pallets[pallets.length - 1].drawingOffsetX + pallets[pallets.length - 1].localMaxX / SCALE_FACTOR;
    const centerOffset = finalWidthScaled / 2;


    document.getElementById('stat-l').innerText = `${finalL.toFixed(1)} cm`;
    document.getElementById('stat-b').innerText = `${finalB.toFixed(1)} cm`;
    document.getElementById('stat-h').innerText = `${overallMaxH.toFixed(1)} cm`;
    document.getElementById('stat-weight').innerText = `${totalOverallWeight.toFixed(1)} kg (${pallets.length} Palette(n))`;
    if (document.getElementById('stat-ldm')) {
        document.getElementById('stat-ldm').innerText = `${totalOverallLDM.toFixed(2)} LDM`;
    }

    camera.position.set(
        centerOffset * 2.5, 
        overallMaxH_scaled * 1.5, 
        centerOffset * 2.5  
    );
    controls.target.set(centerOffset, overallMaxH_scaled / 2, 0); 
    controls.update();
}

// --- 6. GLOBALE LADEKARTEN-FUNKTIONEN ---

let currentPallets = [];
let currentTotalWeight = 0;
let currentTotalLDM = 0;
let currentOverallMaxH = 0;
let currentFinalL = 0;
let currentFinalB = 0;

window.openLadekarteModal = function() {
    if (articlesToLoad.length === 0) {
        alert("Bitte fügen Sie zuerst Artikel zur Ladung hinzu.");
        return;
    }

    const modal = document.getElementById('ladekarteModal');
    modal.classList.remove('hidden');

    const canvas = document.getElementById('ladekarteCanvas');
    const ctx = canvas.getContext('2d');

    // 1. Hintergrund zeichnen (Weiß) und Lade-Text
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 20px "Outfit", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("Generiere Ladekarte im Industrie-Layout... Bitte warten...", canvas.width / 2, canvas.height / 2);

    // 2. Three.js Screenshot machen
    renderer.render(scene, camera);
    const screenshotUrl = renderer.domElement.toDataURL('image/png');

    // 3. QR-Code Daten vorbereiten
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const articleTotals = {};
    articlesToLoad.forEach(entry => {
        const art = entry.item;
        const artNr = art['Artikel-Nr'];
        if (!articleTotals[artNr]) {
            articleTotals[artNr] = 0;
        }
        articleTotals[artNr] += entry.quantity;
    });
    const artNrsStr = Object.keys(articleTotals).join(', ');
    const qrDataText = `LADEKARTE\nDatum: ${dateStr}\nPaletten: ${currentPallets.length}\nGesamt-LDM: ${currentTotalLDM.toFixed(2)} LDM\nGewicht: ${currentTotalWeight.toFixed(1)} kg\nArtikel: ${artNrsStr}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrDataText)}`;

    // 4. Beide Bilder parallel laden
    const loadImg = (src, cors = false) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            if (cors) img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Fehler beim Laden von: ${src}`));
            img.src = src;
        });
    };

    Promise.all([
        loadImg(screenshotUrl),
        loadImg(qrCodeUrl, true)
    ]).then(([screenshotImg, qrImg]) => {
        // Hintergrund komplett säubern
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Screenshot-Rahmen zeichnen (Elegant Frame)
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(15, 20, 770, 760);
        ctx.strokeStyle = '#cbd5e0';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(15, 20, 770, 760);

        // Screenshot links zeichnen
        ctx.drawImage(screenshotImg, 25, 30, 750, 740);

        // Dezenten vertikalen Trennstrich
        ctx.strokeStyle = '#cbd5e0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(800, 20);
        ctx.lineTo(800, 780);
        ctx.stroke();

        // 5. Textinhalte und QR-Code synchron zeichnen
        drawLadekarteText(ctx, canvas, qrImg);
    }).catch(err => {
        console.error(err);
        ctx.fillStyle = '#ef4444';
        ctx.fillText("Fehler beim Generieren des Dokuments. Bitte erneut versuchen.", canvas.width / 2, canvas.height / 2 + 40);
    });
};

function drawLadekarteText(ctx, canvas, qrImg) {
    ctx.fillStyle = '#1e293b';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Dark slate header banner for the right document area
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(815, 20, 370, 70); 

    // Title inside banner
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Outfit", Arial, sans-serif';
    ctx.fillText("VERSAND-LADEKARTE", 830, 33);
    
    // Subtitle inside banner
    ctx.fillStyle = '#3b82f6'; // Premium blue accent
    ctx.font = 'bold 10px "Outfit", Arial, sans-serif';
    ctx.fillText("OFFIZIELLES INDUSTRIE-LADUNGSDOKUMENT", 830, 58);

    // Metadata Row
    const now = new Date();
    const dateStr = now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(815, 95, 370, 35);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.strokeRect(815, 95, 370, 35);
    
    ctx.fillStyle = '#475569';
    ctx.font = '11px "Outfit", Arial, sans-serif';
    ctx.fillText(`Dokumenten-ID: LDK-${now.getTime().toString().slice(-6)}`, 825, 106);
    
    ctx.textAlign = 'right';
    ctx.fillText(`Datum: ${dateStr} - ${timeStr}`, 1175, 106);
    ctx.textAlign = 'left'; // Reset alignment

    // Sektion 1: Kennzahlen
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px "Outfit", Arial, sans-serif';
    ctx.fillText("📊 Sendungs-Statistiken", 815, 145);

    // Box background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(815, 170, 370, 130);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(815, 170, 370, 130);

    const stats = [
        { label: "Anzahl Paletten", val: `${currentPallets.length} Stück` },
        { label: "Lademeter (LDM)", val: `${currentTotalLDM.toFixed(2)} LDM`, highlight: true },
        { label: "Gesamtgewicht", val: `${currentTotalWeight.toFixed(1)} kg` },
        { label: "Gesamthöhe (H)", val: `${currentOverallMaxH.toFixed(1)} cm` },
        { label: "Stellfläche (LxB)", val: `${currentFinalL.toFixed(1)} x ${currentFinalB.toFixed(1)} cm` }
    ];

    let yStat = 177;
    stats.forEach((item, index) => {
        ctx.fillStyle = '#475569';
        ctx.font = '11px "Outfit", Arial, sans-serif';
        ctx.fillText(item.label, 825, yStat);

        ctx.textAlign = 'right';
        ctx.fillStyle = item.highlight ? '#3b82f6' : '#0f172a';
        ctx.font = item.highlight ? 'bold 12px "Outfit", Arial, sans-serif' : 'bold 11px "Outfit", Arial, sans-serif';
        ctx.fillText(item.val, 1175, yStat);
        ctx.textAlign = 'left'; // Reset alignment
        
        if (index < stats.length - 1) {
            ctx.strokeStyle = '#f1f5f9';
            ctx.beginPath();
            ctx.moveTo(825, yStat + 20);
            ctx.lineTo(1175, yStat + 20);
            ctx.stroke();
        }
        yStat += 24;
    });

    // Sektion 2: Ladeliste
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px "Outfit", Arial, sans-serif';
    ctx.fillText("📦 Ladeliste", 815, 315);

    // Header der Ladeliste
    const tableHeaderY = 338;
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(815, tableHeaderY, 370, 24);
    ctx.strokeStyle = '#cbd5e0';
    ctx.strokeRect(815, tableHeaderY, 370, 24);

    ctx.fillStyle = '#475569';
    ctx.font = 'bold 10px "Outfit", Arial, sans-serif';
    ctx.fillText("Pos.", 823, tableHeaderY + 6);
    ctx.fillText("Artikel-Nr. & Name", 855, tableHeaderY + 6);
    ctx.textAlign = 'right';
    ctx.fillText("Menge", 1175, tableHeaderY + 6);
    ctx.textAlign = 'left'; // Reset

    // Artikel aggregieren
    const articleTotals = {};
    articlesToLoad.forEach(entry => {
        const art = entry.item;
        const artNr = art['Artikel-Nr'];
        if (!articleTotals[artNr]) {
            articleTotals[artNr] = {
                name: art.Name,
                qty: 0,
                dims: `${art.L}x${art.B}x${art.H} cm`,
                weight: art.Gewicht
            };
        }
        articleTotals[artNr].qty += entry.quantity;
    });

    let yRow = tableHeaderY + 24;
    let count = 1;
    for (const [artNr, data] of Object.entries(articleTotals)) {
        if (yRow > 530) {
            ctx.fillStyle = '#64748b';
            ctx.font = 'italic 11px "Outfit", Arial, sans-serif';
            ctx.fillText("...weitere Positionen vorhanden", 830, yRow + 8);
            break;
        }

        ctx.strokeStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(815, yRow + 34);
        ctx.lineTo(1185, yRow + 34);
        ctx.stroke();

        // 1. Pos
        ctx.fillStyle = '#475569';
        ctx.font = 'bold 11px "Outfit", Arial, sans-serif';
        ctx.fillText(`${count}`, 825, yRow + 8);

        // 2. Artikelnummer & Name
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 11px "Outfit", Arial, sans-serif';
        let displayName = `${artNr} - ${data.name}`;
        if (displayName.length > 34) {
            displayName = displayName.substring(0, 32) + '...';
        }
        ctx.fillText(displayName, 855, yRow + 5);

        // 3. Subtext: Maße & Gewicht
        ctx.fillStyle = '#64748b';
        ctx.font = '9px "Outfit", Arial, sans-serif';
        ctx.fillText(`Maße: ${data.dims} | Gewicht: ${data.weight} kg`, 855, yRow + 20);

        // 4. Menge
        ctx.textAlign = 'right';
        ctx.fillStyle = '#3b82f6';
        ctx.font = 'bold 12px "Outfit", Arial, sans-serif';
        ctx.fillText(`${data.qty}x`, 1175, yRow + 10);
        ctx.textAlign = 'left'; // Reset

        yRow += 34;
        count++;
    }

    // Sektion 3: QR Code
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 14px "Outfit", Arial, sans-serif';
    ctx.fillText("📱 Digitaler Scan für Lager & Lkw", 815, 575);

    // Light card background for the scan instructions
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(815, 600, 370, 160);
    ctx.strokeStyle = '#e2e8f0';
    ctx.strokeRect(815, 600, 370, 160);

    // QR Code Instructions
    ctx.fillStyle = '#475569';
    ctx.font = '11px "Outfit", Arial, sans-serif';
    ctx.fillText("Scannen Sie diesen Code,", 825, 615);
    ctx.fillText("um die Ladeliste digital", 825, 633);
    ctx.fillText("auf Ihr Mobilgerät zu übertragen.", 825, 651);
    ctx.fillText("Enthält alle Palettendaten,", 825, 669);
    ctx.fillText("Mengen und Abmessungen.", 825, 687);
    
    ctx.fillStyle = '#64748b';
    ctx.font = 'italic 10px "Outfit", Arial, sans-serif';
    ctx.fillText("Ladeplan-Prüfsystem v2.4 Pro", 825, 725);

    // QR Code border box with padding
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(1040, 610, 130, 130);
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1;
    ctx.strokeRect(1040, 610, 130, 130);

    // Draw the preloaded QR Image inside
    ctx.drawImage(qrImg, 1045, 615, 120, 120);
}

window.closeLadekarteModal = function() {
    const modal = document.getElementById('ladekarteModal');
    modal.classList.add('hidden');
};

window.downloadLadekarte = function() {
    const canvas = document.getElementById('ladekarteCanvas');
    const dataUrl = canvas.toDataURL('image/png');
    
    const link = document.createElement('a');
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const artNrs = articlesToLoad.map(entry => entry.item['Artikel-Nr']).slice(0, 3).join('_');
    link.download = `Ladekarte_${dateStr}_${artNrs || 'Ladung'}.png`;
    link.href = dataUrl;
    link.click();
};

window.printLadekarteCanvas = function() {
    const canvas = document.getElementById('ladekarteCanvas');
    const dataUrl = canvas.toDataURL('image/png');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write('<html><head><title>Ladekarte drucken</title></head><body style="margin:0; display:flex; align-items:center; justify-content:center; height:100vh;">');
    printWindow.document.write('<img src="' + dataUrl + '" style="max-width:100%; max-height:100%; object-fit:contain; page-break-inside:avoid;" onload="window.print(); window.close();" />');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
};

function displaySidebar(pallets) {
    const container = document.getElementById('palletContent');
    if (!container) return;

    let html = '';
    
    if (pallets.length === 0) {
        html = '<p class="note">Keine Ladung vorhanden.</p>';
    } else {
        pallets.forEach(pallet => {
            const articleCount = pallet.items.reduce((acc, current) => {
                acc[current.item['Artikel-Nr']] = (acc[current.item['Artikel-Nr']] || 0) + 1;
                return acc;
            }, {});

            // Prüfen, ob diese Palette Sonderpaletten-Maße enthält
            let isPalletSpecial = false;
            pallet.items.forEach(pItem => {
                const item = pItem.item;
                if (item.L > 240 || item.B > 240 || item.H > 220 || (item.L > 120 && item.B > 120)) {
                    isPalletSpecial = true;
                }
            });

            html += `<div class="pallet-entry ${isPalletSpecial ? 'special-pallet' : ''}">
                        <strong>Palette #${pallet.id}</strong>
                        <ul>`;
            
            for (const [artNr, count] of Object.entries(articleCount)) {
                // Finde den passenden Artikelnamen aus der Ladung
                const loadedItem = pallet.items.find(pi => pi.item['Artikel-Nr'] === artNr);
                const name = loadedItem ? loadedItem.item.Name : artNr;
                html += `<li>${count}x ${name} (${artNr})</li>`;
            }
            
            html += `</ul>
                     <p>L: ${pallet.maxL.toFixed(1)} cm | B: ${pallet.maxB.toFixed(1)} cm</p>
                     <p>H: ${pallet.finalHeight.toFixed(1)} cm | G: ${pallet.finalWeight.toFixed(1)} kg</p>
                    </div>`;
        });
    }

    container.innerHTML = html;
}

// Initialisiere die UI beim Laden der Seite
updateLoadList();
loadAndParseCSV();
