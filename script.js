// --- 1. GLOBALE KONSTANTEN & DATENSTRUKTUREN ---
let itemData = {};
let articlesToLoad = []; 
const CSV_FILE_PATH = 'stammdaten.csv';

// Maximale Paletten-Dimensionen
const MAX_PALETTE_L = 285;
const MAX_PALETTE_B = 180;
const MAX_PALETTE_H = 160;

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
                'L': parseFloat(values[2].trim()),
                'B': parseFloat(values[3].trim()),
                'H': parseFloat(values[4].trim()),
                'Gewicht': parseFloat(values[5].trim()),
                'Einheit': values[6].trim(),    
                'color': parseInt(values[7].trim(), 16) 
            };
            
            itemData[item['Artikel-Nr']] = item;
        }

        initThreeJs();
        updateLoadList();
        visualizePackage(); 
        
    } catch (error) {
        console.error("Fehler beim Laden/Parsen der CSV-Daten:", error);
        alert("Fehler beim Laden der CSV-Daten. Prüfen Sie die Konsolenausgabe und den Server-Status.");
    }
}


// --- 3. UI/LADUNGS-MANAGEMENT FUNKTIONEN ---

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
    const articleNr = document.getElementById('articleInput').value.trim();
    let quantity = parseInt(document.getElementById('quantityInput').value, 10);

    if (!articleNr || quantity <= 0 || isNaN(quantity)) {
        alert("Bitte eine gültige Artikelnummer und Menge eingeben.");
        return;
    }

    const item = itemData[articleNr];
    if (!item || item['Einheit'] === 'Palette') {
        alert("Artikelnummer nicht gefunden oder ist eine Palette.");
        return;
    }

    articlesToLoad.push({ item, quantity });
    updateLoadList();
    document.getElementById('articleInput').value = '';
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

    renderer = new THREE.WebGLRenderer({ antialias: true });
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
    const objectsToRemove = scene.children.filter(obj => obj.type === 'Mesh' || obj.type === 'Line' || obj.type === 'Sprite');
    objectsToRemove.forEach(obj => scene.remove(obj));
}

function drawBox(data, positionY, positionX = 0, positionZ = 0) {
    const l = data.L / SCALE_FACTOR;
    const b = data.B / SCALE_FACTOR;
    const h = data.H / SCALE_FACTOR;
    
    const geometry = new THREE.BoxGeometry(l, h, b);
    const material = new THREE.MeshStandardMaterial({ color: data.color });
    
    const box = new THREE.Mesh(geometry, material);
    box.position.set(positionX, positionY + (h / 2), positionZ); 
    
    scene.add(box);
    return box;
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

    const paletteBase = itemData['PAL-EU'];
    const pal_L = paletteBase.L;
    const pal_B = paletteBase.B;
    
    clearScene();

    if (articlesToLoad.length === 0) {
        drawBox(paletteBase, 0, 0, 0);
        document.getElementById('stat-l').innerText = `${pal_L} cm`;
        document.getElementById('stat-b').innerText = `${pal_B} cm`;
        document.getElementById('stat-h').innerText = `${paletteBase.H.toFixed(1)} cm`;
        document.getElementById('stat-weight').innerText = `${paletteBase.Gewicht.toFixed(1)} kg (Leer)`;
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

        // LOGIK FÜR EXTREME LÄNGE (NEUE PALETTE, KEINE OPTIMIERUNG)
        if (item.L > pal_L || item.B > pal_B) { // Wenn Artikel die Paletten-Basis überragt
            
            const newMaxL = Math.max(currentPallet.maxL, item.L);
            const newMaxB = Math.max(currentPallet.maxB, item.B);
            const heightOkay = currentPallet.currentH + item.H <= MAX_PALETTE_H;

            if (newMaxL <= MAX_PALETTE_L && newMaxB <= MAX_PALETTE_B && heightOkay && currentPallet.items.length === 0) {
                // Darf nur auf leere Palette und nur zentriert
                currentPallet.items.push({ item, posL: 0, posZ: 0, posH: currentPallet.currentH });
                currentPallet.layerHeight = item.H;
                currentPallet.currentH += item.H; 
                currentPallet.maxL = newMaxL;
                currentPallet.maxB = newMaxB;
                placed = true;
            } else {
                // ZU GROSS oder Palette bereits belegt -> Neue Palette erzwingen
                let lastPallet = pallets[pallets.length - 1];
                currentPallet = createNewPallet(pallets.length + 1, paletteBase, lastPallet);
                pallets.push(currentPallet);
                i--; // Artikel muss erneut geladen werden
                continue;
            }
        }
        
        // LOGIK FÜR KLEINERE ARTIKEL (< 120cm) UND STAPELOPTIMIERUNG
        else {
            while(!placed) {
                
                let nextStackHeight = currentPallet.currentH; 
                if (currentPallet.isLayerFull) {
                    nextStackHeight = currentPallet.currentH + currentPallet.layerHeight;
                }
                
                const heightOkay = nextStackHeight + item.H <= MAX_PALETTE_H;
                
                // 1. Prüfen, ob Stapelung oder Basis-Füllung möglich ist
                if (currentPallet.items.length === 0 && item.L <= pal_L && item.B <= pal_B) {
                    // Item ist klein und Palette leer: Beginne normale Flächenfüllung (zentriert)
                    currentPallet.items.push({ item, posL: 0, posZ: 0, posH: currentPallet.currentH });
                    currentPallet.layerHeight = item.H;
                    currentPallet.currentH = nextStackHeight; 
                    currentPallet.maxL = pal_L; 
                    currentPallet.maxB = pal_B;
                    placed = true;
                    currentPallet.isLayerFull = false; 
                } 
                else if (!currentPallet.isLayerFull) {

                    const remainingL = (pal_L / 2) - currentPallet.xCursor; 
                    const fitsInCurrentRow = item.L <= remainingL;
                    const remainingB = (pal_B / 2) - currentPallet.maxZInRow;
                    const fitsInNewRow = item.B <= remainingB;

                    if (fitsInCurrentRow) {
                        // 1a. PLATZIERUNG IN AKTUELLE REIHE
                        const posL = currentPallet.xCursor + (item.L / 2); 
                        const posZ = currentPallet.zCursor + (item.B / 2); 
                        
                        currentPallet.items.push({ item, posL, posZ, posH: currentPallet.currentH });
                        currentPallet.xCursor += item.L;
                        currentPallet.maxZInRow = Math.max(currentPallet.maxZInRow, currentPallet.zCursor + item.B);
                        placed = true;
                        
                    } else if (fitsInNewRow) {
                        // 2a. NEUE REIHE STARTEN
                        currentPallet.zCursor = currentPallet.maxZInRow; 
                        currentPallet.xCursor = -pal_L / 2; 
                        
                    } else {
                        // 3a. BASIFLÄCHE DER AKTUELLEN SCHICHT IST VOLL
                        currentPallet.isLayerFull = true;
                        currentPallet.currentH += currentPallet.layerHeight; 
                        
                        // NEUE HÖHE PRÜFEN
                        if (currentPallet.currentH + item.H > MAX_PALETTE_H) {
                            break; 
                        }
                        
                        // Setze Cursor für neue Schicht zurück
                        currentPallet.xCursor = -pal_L / 2; 
                        currentPallet.zCursor = -pal_B / 2;
                        currentPallet.maxZInRow = -pal_B / 2;
                        currentPallet.layerHeight = item.H; 
                        currentPallet.isLayerFull = false;
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
    }
    
    // --- 7. RENDERING & DATEN-AGGREGATION ---
    let overallMaxH = 0;
    let totalOverallWeight = 0;
    
    pallets.forEach(pallet => {
        const pL_scaled = pal_L / SCALE_FACTOR;
        const pB_scaled = pal_B / SCALE_FACTOR;
        const offsetX = pallet.drawingOffsetX;
        const offsetZ = pallet.drawingOffsetZ;
        
        drawBox(paletteBase, 0, offsetX, offsetZ); 

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
    });

    // --- 8. STATISTIKEN & KAMERA ---

    const overallMaxH_scaled = overallMaxH / SCALE_FACTOR;

    const finalL = pallets.reduce((max, p) => Math.max(max, p.maxL), pal_L);
    const finalB = pallets.reduce((max, p) => Math.max(max, p.maxB), pal_B);

    displaySidebar(pallets);
    
    const lastPalletOffset = pallets[pallets.length - 1].drawingOffsetX;
    const totalWidthScaled = lastPalletOffset + (pal_L / SCALE_FACTOR);
    const centerOffset = totalWidthScaled / 2;


    document.getElementById('stat-l').innerText = `${finalL.toFixed(1)} cm`;
    document.getElementById('stat-b').innerText = `${finalB.toFixed(1)} cm`;
    document.getElementById('stat-h').innerText = `${overallMaxH.toFixed(1)} cm`;
    document.getElementById('stat-weight').innerText = `${totalOverallWeight.toFixed(1)} kg (${pallets.length} Palette(n))`;

    camera.position.set(
        centerOffset * 2.5, 
        overallMaxH_scaled * 1.5, 
        centerOffset * 2.5  
    );
    controls.target.set(centerOffset, overallMaxH_scaled / 2, 0); 
    controls.update();
}

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

            html += `<div class="pallet-entry">
                        <strong>Palette #${pallet.id}</strong>
                        <ul>`;
            
            for (const [artNr, count] of Object.entries(articleCount)) {
                const name = itemData[artNr].Name;
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