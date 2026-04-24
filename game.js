// Marge intérieure pour éviter que les éléments ne soient coupés
const GAME_PADDING = 24;
(function(){
    // --- ÉLÉMENTS CANVAS ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    let width, height;

    // --- ÉTOILES ---
    let stars = [];
    function initStars() {
        stars = [];
        const starCount = Math.floor(width * height / 1600);
        for (let i = 0; i < starCount; i++) {
            stars.push({
                x: Math.random() * width,
                y: Math.random() * (height * 0.85),
                radius: 1 + Math.random() * 3,
                alpha: 0.5 + Math.random() * 0.5,
                twinkleSpeed: 0.005 + Math.random() * 0.02,
                phase: Math.random() * Math.PI * 2,
                color: `hsl(${40 + Math.random() * 40}, 80%, 70%)`
            });
        }
    }

    // --- ÉTAT DU JEU ---
    let gameRunning = true;
    let score = 0;
    let bestScore = localStorage.getItem('unicorn404_best_night') ? parseInt(localStorage.getItem('unicorn404_best_night')) : 0;
    document.getElementById('bestValue').innerText = bestScore;

    // --- LICORNE ---
    const unicorn = { x: 0, y: 0, radius: 32 };
    let protectedUntil = 0;   // timestamp de fin de protection

    // --- 404 ---
    const error404 = {
        x: 0, y: 0,
        normalRadius: 36,
        specialRadius: 55,
        radius: 36,
        baseSpeed: 1.2,
        blink: 0,
        specialEndTime: 0,
        isDead: false,
        respawnTime: 0
    };

    // --- MISSILES & FLAMMES & BONUS ---
    let missiles = [];      // {x, y, targetX, targetY, symbol, startTime, duration}
    let flames = [];        // {x, y, radius}
    let explosions = [];    // {x, y, endTime}
    let bonuses = [];       // {x, y, type, symbol, endTime, radius}

    let nextShotDelay = 0;
    let lastShotTime = 0;
    const SHOT_MIN = 4500;
    const SHOT_MAX = 8000;
    const FLAME_RADIUS = 22;
    const EXPLOSION_DURATION = 300;
    const MISSILE_SPEED = 4;
    const BONUS_LIFESPAN = 5000;
    const BONUS_RADIUS = 18;
    const PROB_BOMB = 0.3;   // 30% de 💣

    // --- MESSAGES TEMPORAIRES ---
    let currentMessage = "";
    let messageEndTime = 0;
    function showMessage(msg, duration = 2000) {
        currentMessage = msg;
        messageEndTime = Date.now() + duration;
        const msgDiv = document.getElementById('effectMessage');
        if (msgDiv) msgDiv.innerText = msg;
        setTimeout(() => {
            if (Date.now() >= messageEndTime && msgDiv) msgDiv.innerText = "";
        }, duration);
    }

    // --- CRÉATION D'UN BONUS (post-explosion 💣) ---
    function createBonus(x, y) {
        const types = ['death', 'shield', 'clean'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        let symbol = "";
        if (chosen === 'death') symbol = "☢️";
        else if (chosen === 'shield') symbol = "🛡️";
        else symbol = "💦";
        bonuses.push({
            x, y, type: chosen, symbol,
            endTime: Date.now() + BONUS_LIFESPAN,
            radius: BONUS_RADIUS
        });
    }

    // --- COLLECTION DES BONUS PAR LA LICORNE ---
    function checkBonusesCollision(now) {
        for (let i = 0; i < bonuses.length; i++) {
            let b = bonuses[i];
            if (now >= b.endTime) {
                bonuses.splice(i,1); i--; continue;
            }
            const dx = unicorn.x - b.x, dy = unicorn.y - b.y;
            if (Math.hypot(dx, dy) < unicorn.radius + b.radius) {
                switch(b.type) {
                    case 'death':
                        if (!error404.isDead) {
                            error404.isDead = true;
                            error404.respawnTime = now + 3000;
                            showMessage("☢️ 404 DÉSINTÉGRÉ – REVIENT DANS 3s", 2500);
                        }
                        break;
                    case 'shield':
                        protectedUntil = now + 5000;
                        showMessage("🛡️ PROTECTION TOTALE CONTRE 404 (5s)", 2500);
                        break;
                    case 'clean':
                        flames = [];
                        showMessage("💦 TOUTES LES FLAMMES ONT DISPARU", 2000);
                        break;
                }
                bonuses.splice(i,1); i--;
            }
        }
    }

    // --- SPAWN D'UN MISSILE ---
    function spawnMissile(now) {
        if (!gameRunning || error404.isDead) return;
        const fromX = error404.x, fromY = error404.y;
        const targetX = unicorn.x, targetY = unicorn.y;
        const dist = Math.hypot(targetX - fromX, targetY - fromY);
        if (dist < 0.01) return;
        const duration = dist / MISSILE_SPEED;
        const isBomb = Math.random() < PROB_BOMB;
        const symbol = isBomb ? '💣' : '🧨';
        missiles.push({
            x: fromX, y: fromY,
            targetX, targetY,
            symbol, startTime: now,
            duration: duration * 16.67   // conversion frames -> ms
        });
    }

    function trySpawnMissile(now) {
        if (!gameRunning || error404.isDead) return;
        if (nextShotDelay === 0) {
            nextShotDelay = SHOT_MIN + Math.random() * (SHOT_MAX - SHOT_MIN);
            lastShotTime = now;
            return;
        }
        if (now - lastShotTime >= nextShotDelay) {
            spawnMissile(now);
            nextShotDelay = SHOT_MIN + Math.random() * (SHOT_MAX - SHOT_MIN);
            lastShotTime = now;
        }
    }

    // --- MISE À JOUR DES MISSILES ---
    function updateMissiles(now) {
        for (let i = 0; i < missiles.length; i++) {
            let m = missiles[i];
            let elapsed = now - m.startTime;
            let progress = Math.min(1, elapsed / m.duration);
            m.x = m.targetX * progress + m.x * (1 - progress);
            m.y = m.targetY * progress + m.y * (1 - progress);

            // Collision avec la licorne ?
            if (Math.hypot(unicorn.x - m.x, unicorn.y - m.y) < unicorn.radius + 15) {
                if (m.symbol === '🧨') {
                    explosions.push({ x: unicorn.x, y: unicorn.y, endTime: now + EXPLOSION_DURATION });
                    flames.push({ x: unicorn.x, y: unicorn.y, radius: FLAME_RADIUS });
                } else {
                    explosions.push({ x: unicorn.x, y: unicorn.y, endTime: now + EXPLOSION_DURATION });
                    createBonus(unicorn.x, unicorn.y);
                }
                missiles.splice(i,1); i--;
                continue;
            }

            // Arrivée à destination
            if (progress >= 1) {
                if (m.symbol === '🧨') {
                    explosions.push({ x: m.targetX, y: m.targetY, endTime: now + EXPLOSION_DURATION });
                    flames.push({ x: m.targetX, y: m.targetY, radius: FLAME_RADIUS });
                } else {
                    explosions.push({ x: m.targetX, y: m.targetY, endTime: now + EXPLOSION_DURATION });
                    createBonus(m.targetX, m.targetY);
                }
                missiles.splice(i,1); i--;
            }
        }
    }

    // --- EXPLOSIONS TEMPORAIRES ---
    function updateExplosions(now) {
        for (let i=0; i<explosions.length; i++) {
            if (now >= explosions[i].endTime) explosions.splice(i--,1);
        }
    }

    // --- COLLISION AVEC LES FLAMMES (game over) ---
    function checkFlamesCollision() {
        for (let f of flames) {
            if (Math.hypot(unicorn.x - f.x, unicorn.y - f.y) < unicorn.radius + f.radius) {
                gameOver();
                return true;
            }
        }
        return false;
    }

    // --- GESTION DE LA MORT TEMPORAIRE DU 404 ---
    function update404Respawn(now) {
        if (error404.isDead && now >= error404.respawnTime) {
            error404.isDead = false;
            error404.x = Math.random() * (width - 2 * error404.radius) + error404.radius;
            error404.y = Math.min(Math.max(80, Math.random() * (height * 0.3) + 30), height - error404.radius);
            showMessage("☢️ 404 RÉAPPARAÎT", 1500);
        }
    }

    // --- VITESSE DU 404 (avec bonus de score) ---
    function getCurrentSpeed() {
        if (error404.isDead) return 0;
        let bonus = Math.floor(score / 50);
        let speed = error404.baseSpeed + bonus;
        if (error404.specialEndTime > Date.now() && error404.activeEffect === 'speedBoost') speed *= 2;
        return speed;
    }

    // --- GESTION DES EFFETS SPÉCIAUX DU 404 ---
    let lastSpecialCheck = 0, nextSpecialDelay = 0;
    let activeEffect = null;   // 'expand', 'speedBoost', 'invert'
    let effectEndTime = 0;
    let invertedControls = false;

    function tryTriggerSpecial(now) {
        if (!gameRunning || error404.isDead) return;
        if (effectEndTime > now) return;
        if (nextSpecialDelay === 0) {
            nextSpecialDelay = 12000 + Math.random() * 8000;
            lastSpecialCheck = now;
            return;
        }
        if (now - lastSpecialCheck >= nextSpecialDelay) {
            const effects = ['expand', 'speedBoost', 'invert'];
            activeEffect = effects[Math.floor(Math.random() * effects.length)];
            effectEndTime = now + 3000;
            switch(activeEffect) {
                case 'expand':
                    error404.radius = error404.specialRadius;
                    showMessage("⚠️ SCIE EXTERNE TOURNANTE ⚠️", 2500);
                    break;
                case 'speedBoost':
                    showMessage("⚡ 404 FULGURANT ⚡", 2000);
                    break;
                // effet 'teleport' supprimé
                case 'invert':
                    invertedControls = true;
                    showMessage("🔄 COMMANDES INVERSÉES 🔄", 2500);
                    break;
            }
            nextSpecialDelay = 12000 + Math.random() * 8000;
            lastSpecialCheck = now;
        }
    }

    function updateSpecial(now) {
        if (activeEffect && now >= effectEndTime) {
            if (activeEffect === 'expand') error404.radius = error404.normalRadius;
            if (activeEffect === 'invert') invertedControls = false;
            activeEffect = null;
            effectEndTime = 0;
        }
    }

    // --- DÉPLACEMENT DE LA LICORNE (souris + inversion) ---
    function handleMouseMove(e) {
        if (!gameRunning) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let canvasX = (e.clientX - rect.left) * scaleX;
        let canvasY = (e.clientY - rect.top) * scaleY;
        // Appliquer la marge intérieure
        canvasX = Math.max(GAME_PADDING, Math.min(canvasX, width - GAME_PADDING));
        canvasY = Math.max(GAME_PADDING, Math.min(canvasY, height - GAME_PADDING));
        if (invertedControls && activeEffect === 'invert') {
            let dx = canvasX - unicorn.x, dy = canvasY - unicorn.y;
            let dist = Math.hypot(dx, dy);
            if (dist > 0.01) {
                let move = 8;
                unicorn.x -= (dx / dist) * move;
                unicorn.y -= (dy / dist) * move;
            }
        } else {
            unicorn.x = canvasX;
            unicorn.y = canvasY;
        }
        unicorn.x = Math.min(Math.max(unicorn.x, unicorn.radius + GAME_PADDING), width - unicorn.radius - GAME_PADDING);
        unicorn.y = Math.min(Math.max(unicorn.y, unicorn.radius + GAME_PADDING), height - unicorn.radius - GAME_PADDING);
    }

    // --- MOUVEMENT DU 404 VERS LA LICORNE ---
    function updateEnemy() {
        if (!gameRunning || error404.isDead) return;
        let dx = unicorn.x - error404.x, dy = unicorn.y - error404.y;
        let dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
            let speed = getCurrentSpeed();
            error404.x += (dx / dist) * speed;
            error404.y += (dy / dist) * speed;
        }
        error404.x = Math.min(Math.max(error404.x, error404.radius + GAME_PADDING), width - error404.radius - GAME_PADDING);
        error404.y = Math.min(Math.max(error404.y, error404.radius + GAME_PADDING), height - error404.radius - GAME_PADDING);
        error404.blink = (error404.blink + 0.12) % (Math.PI * 2);
    }

    // --- COLLISION AVEC LE 404 (game over si pas protégé) ---
    function checkCollision() {
        if (error404.isDead) return false;
        if (protectedUntil > Date.now()) return false;
        if (Math.hypot(unicorn.x - error404.x, unicorn.y - error404.y) < unicorn.radius + error404.radius) {
            gameOver();
            return true;
        }
        return false;
    }

    // --- GAME OVER ---
    function gameOver() {
        if (!gameRunning) return;
        gameRunning = false;
        if (score > bestScore) {
            bestScore = score;
            localStorage.setItem('unicorn404_best_night', bestScore);
            document.getElementById('bestValue').innerText = bestScore;
        }
        canvas.style.cursor = 'default';
    }

    // --- REDÉMARRAGE COMPLET ---
    function restartGame() {
        error404.x = width/2; error404.y = 80;
        unicorn.x = width/2; unicorn.y = height - 80;
        error404.radius = error404.normalRadius;
        error404.isDead = false;
        protectedUntil = 0;
        activeEffect = null; effectEndTime = 0; invertedControls = false;
        score = 0;
        missiles = [];
        flames = [];
        explosions = [];
        bonuses = [];
        nextShotDelay = 0; lastShotTime = 0;
        currentMessage = ""; messageEndTime = 0;
        document.getElementById('effectMessage').innerText = "";
        document.getElementById('scoreValue').innerText = "0";
        gameRunning = true;
        canvas.style.cursor = 'none';
        lastSpecialCheck = 0; nextSpecialDelay = 0;
    }

    // ---------- DESSIN (décor, entités) ----------
    function drawMoon(x, y, r) {
        // Empêche la lune d'être coupée
        x = Math.max(GAME_PADDING + r, Math.min(x, width - GAME_PADDING - r));
        y = Math.max(GAME_PADDING + r, Math.min(y, height - GAME_PADDING - r));
        ctx.shadowBlur = 50; ctx.shadowColor = "#ffe8b5";
        ctx.fillStyle = "#fffbe6"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#e6d5a8";
        ctx.beginPath(); ctx.arc(x - r*0.25, y - r*0.15, r*0.18, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r*0.3, y + r*0.1, r*0.14, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x - r*0.1, y + r*0.25, r*0.1, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = "#cfba7a";
        ctx.beginPath(); ctx.arc(x - r*0.35, y + r*0.05, r*0.07, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r*0.15, y - r*0.25, r*0.09, 0, Math.PI*2); ctx.fill();
    }

    function drawBackground() {
        const grad = ctx.createLinearGradient(0,0,0,height);
        grad.addColorStop(0,'#070b1a'); grad.addColorStop(0.6,'#11162b'); grad.addColorStop(1,'#1a2340');
        ctx.fillStyle = grad; ctx.fillRect(0,0,width,height);
        for (let s of stars) {
            let tw = 0.5+0.5*Math.sin(s.phase+Date.now()*s.twinkleSpeed);
            ctx.globalAlpha = s.alpha*(0.6+tw*0.4);
            ctx.fillStyle = s.color;
            // Empêche les étoiles d'être coupées
            let sx = Math.max(GAME_PADDING + s.radius, Math.min(s.x, width - GAME_PADDING - s.radius));
            let sy = Math.max(GAME_PADDING + s.radius, Math.min(s.y, height - GAME_PADDING - s.radius));
            ctx.beginPath(); ctx.arc(sx,sy,s.radius,0,Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        drawMoon(GAME_PADDING + 48, GAME_PADDING + 48, 48);
        ctx.fillStyle = '#0f2b20'; ctx.fillRect(GAME_PADDING,height-60-GAME_PADDING,width-2*GAME_PADDING,60);
        ctx.fillStyle = '#2c6e4f';
        for(let i=0;i<180;i++){
            let x=(i*23)%(width-2*GAME_PADDING)+GAME_PADDING, y=height-52+Math.sin(i*0.5)*5;
            ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+4,y-14); ctx.lineTo(x+8,y); ctx.fill();
        }
        ctx.fillStyle = '#0c1f15';
        for(let i=0;i<20;i++) ctx.fillRect(GAME_PADDING+40+i*70,height-58,20,12);
        ctx.fillStyle = '#0f1f14';
        function drawTree(xTree,yBase){
            xTree = Math.max(GAME_PADDING+28, Math.min(xTree, width-GAME_PADDING-28));
            ctx.fillRect(xTree-10,yBase-50,20,55);
            ctx.beginPath(); ctx.arc(xTree,yBase-60,28,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(xTree-15,yBase-68,22,0,Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(xTree+15,yBase-68,22,0,Math.PI*2); ctx.fill();
            ctx.fillStyle = '#1f3a28';
            ctx.fillRect(xTree-20,yBase-70,6,12); ctx.fillRect(xTree+14,yBase-70,6,12);
            ctx.fillStyle = '#0f1f14';
        }
        drawTree(GAME_PADDING+100,height-50); drawTree(width-GAME_PADDING-120,height-55); drawTree(GAME_PADDING+50,height-48);
        drawTree(width-GAME_PADDING-70,height-52); drawTree(width-GAME_PADDING-200,height-54);
    }

    function drawUnicorn() {
        // Empêche la licorne d'être coupée
        let ux = Math.max(GAME_PADDING + unicorn.radius, Math.min(unicorn.x, width - GAME_PADDING - unicorn.radius));
        let uy = Math.max(GAME_PADDING + unicorn.radius, Math.min(unicorn.y, height - GAME_PADDING - unicorn.radius));
        ctx.font = `64px "Segoe UI Emoji", "Apple Color Emoji"`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        ctx.shadowBlur=14; ctx.shadowColor="#ffddaa";
        ctx.fillStyle="#fff"; ctx.fillText("🦄", ux, uy);
        ctx.shadowBlur=0;
        if (protectedUntil > Date.now()) {
            ctx.font="bold 20px monospace"; ctx.fillStyle="#88ffaa";
            ctx.fillText("🛡️ PROTECTION", ux, uy-40);
        }
    }

    function drawSpikes(x,y,radius,angleOffset,spikes=24){
        ctx.save(); ctx.shadowBlur=0; ctx.fillStyle="#ff6600";
        const len = radius*0.45;
        for(let i=0;i<spikes;i++){
            let ang = angleOffset + (i/spikes)*Math.PI*2;
            let x1=x+Math.cos(ang)*radius, y1=y+Math.sin(ang)*radius;
            let x2=x+Math.cos(ang)*(radius+len), y2=y+Math.sin(ang)*(radius+len);
            let perp = ang+Math.PI/2, spread=len*0.35;
            let x3=x2-Math.cos(perp)*spread, y3=y2-Math.sin(perp)*spread;
            let x4=x2+Math.cos(perp)*spread, y4=y2+Math.sin(perp)*spread;
            ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x3,y3); ctx.lineTo(x4,y4); ctx.fill();
        }
        ctx.restore();
    }

    function draw404() {
        if (error404.isDead) return;
        let intensity = (Math.sin(error404.blink)+1)/2;
        let ex = Math.max(GAME_PADDING + error404.radius, Math.min(error404.x, width - GAME_PADDING - error404.radius));
        let ey = Math.max(GAME_PADDING + error404.radius, Math.min(error404.y, height - GAME_PADDING - error404.radius));
        ctx.save(); ctx.shadowBlur=18; ctx.shadowColor=`rgba(200,20,20,${0.7+intensity*0.3})`;
        let fontSize = Math.floor(error404.radius*1.6);
        ctx.font = `bold ${fontSize}px "Courier New", monospace`;
        ctx.textAlign="center"; ctx.textBaseline="middle";
        let r = 180+Math.floor(75*intensity);
        ctx.fillStyle = `rgb(${r},25,25)`;
        ctx.fillText("404", ex, ey);
        ctx.fillStyle = `rgba(255,100,100,${0.5+intensity*0.3})`;
        ctx.fillText("404", ex-2, ey-2);
        ctx.restore();
        if (activeEffect === 'expand') {
            let rot = Date.now()/50;
            drawSpikes(ex, ey, error404.radius+4, rot, 28);
            ctx.beginPath(); ctx.arc(ex, ey, error404.radius+10,0,Math.PI*2);
            ctx.strokeStyle="#ff4444"; ctx.lineWidth=3; ctx.shadowBlur=15; ctx.shadowColor="#f00";
            ctx.stroke(); ctx.shadowBlur=0;
        }
    }

    function drawMissiles() {
        for(let m of missiles){
            let mx = Math.max(GAME_PADDING, Math.min(m.x, width - GAME_PADDING));
            let my = Math.max(GAME_PADDING, Math.min(m.y, height - GAME_PADDING));
            ctx.font="28px 'Segoe UI Emoji'"; ctx.textAlign="center"; ctx.textBaseline="middle";
            ctx.fillStyle="#ffaa44"; ctx.fillText(m.symbol, mx, my);
        }
    }
    function drawFlames() {
        for(let f of flames){
            let fx = Math.max(GAME_PADDING + f.radius, Math.min(f.x, width - GAME_PADDING - f.radius));
            let fy = Math.max(GAME_PADDING + f.radius, Math.min(f.y, height - GAME_PADDING - f.radius));
            ctx.font=`${Math.floor(f.radius*1.2)}px "Segoe UI Emoji"`;
            ctx.fillStyle="#ff6600"; ctx.fillText("🔥", fx, fy);
            ctx.beginPath(); ctx.arc(fx, fy, f.radius,0,Math.PI*2);
            ctx.strokeStyle="rgba(255,80,0,0.7)"; ctx.lineWidth=2; ctx.stroke();
        }
    }
    function drawBonuses(now) {
        for(let b of bonuses){
            if(now>=b.endTime) continue;
            let bx = Math.max(GAME_PADDING + b.radius, Math.min(b.x, width - GAME_PADDING - b.radius));
            let by = Math.max(GAME_PADDING + b.radius, Math.min(b.y, height - GAME_PADDING - b.radius));
            ctx.font="28px 'Segoe UI Emoji'"; ctx.fillStyle="#ffff88";
            ctx.fillText(b.symbol, bx, by);
            ctx.beginPath(); ctx.arc(bx, by, b.radius,0,Math.PI*2);
            ctx.strokeStyle="#ffff88"; ctx.lineWidth=2; ctx.stroke();
            let remain = (b.endTime-now)/BONUS_LIFESPAN;
            ctx.fillStyle="#ffff88";
            ctx.fillRect(bx-b.radius, by-b.radius-8, b.radius*2*remain, 4);
        }
    }
    function drawExplosions(now) {
        for(let ex of explosions){
            let exx = Math.max(GAME_PADDING, Math.min(ex.x, width - GAME_PADDING));
            let exy = Math.max(GAME_PADDING, Math.min(ex.y, height - GAME_PADDING));
            ctx.font="32px 'Segoe UI Emoji'"; ctx.fillStyle="#ffaa44";
            ctx.fillText("💥", exx, exy);
        }
    }

    // --- REDIMENSIONNEMENT ---
    function resizeCanvas() {
        const container = canvas.parentElement;
        width = container.clientWidth;
        height = container.clientHeight;
        canvas.width = width; canvas.height = height;
        initStars();
        if (gameRunning) {
            unicorn.x = Math.min(Math.max(unicorn.x, unicorn.radius + GAME_PADDING), width - unicorn.radius - GAME_PADDING);
            unicorn.y = Math.min(Math.max(unicorn.y, unicorn.radius + GAME_PADDING), height - unicorn.radius - GAME_PADDING);
            if (!error404.isDead) {
                error404.x = Math.min(Math.max(error404.x, error404.radius + GAME_PADDING), width - error404.radius - GAME_PADDING);
                error404.y = Math.min(Math.max(error404.y, error404.radius + GAME_PADDING), height - error404.radius - GAME_PADDING);
            }
        }
    }

    // --- BOUCLE D'ANIMATION ---
    let frame = 0;
    function animate(now) {
        if (!width || !height) { requestAnimationFrame(animate); return; }
        const currentTime = Date.now();
        tryTriggerSpecial(currentTime);
        updateSpecial(currentTime);
        trySpawnMissile(currentTime);
        updateMissiles(currentTime);
        updateExplosions(currentTime);
        update404Respawn(currentTime);
        checkBonusesCollision(currentTime);

        if (!gameRunning) {
            drawBackground(); drawUnicorn(); draw404();
            drawMissiles(); drawFlames(); drawBonuses(currentTime); drawExplosions(currentTime);
            ctx.font="bold 28px monospace"; ctx.fillStyle="#ffffffcc";
            ctx.fillText("💀 GAME OVER 💀", width/2, 70);
            requestAnimationFrame(animate); return;
        }

        frame++;
        if (frame % 6 === 0) { score++; document.getElementById('scoreValue').innerText = Math.floor(score); }
        updateEnemy();
        checkCollision();
        checkFlamesCollision();
        drawBackground(); drawUnicorn(); draw404();
        drawMissiles(); drawFlames(); drawBonuses(currentTime); drawExplosions(currentTime);
        ctx.font="bold 14px monospace"; ctx.fillStyle="#ffe8cc";
        ctx.fillText("⚡ VITESSE: "+getCurrentSpeed().toFixed(1), width-130, 40);
        if (activeEffect === 'expand') ctx.fillText("⚠️ SCIE EXTERNE TOURNANTE ⚠️", width/2, 32);
        if (error404.isDead) { ctx.font="bold 20px monospace"; ctx.fillStyle="#ffaa66";
            ctx.fillText("☢️ 404 DÉSINTÉGRÉ ☢️", width/2, 60); }
        requestAnimationFrame(animate);
    }

    // --- INITIALISATION ---
    window.addEventListener('resize', () => {
        resizeCanvas();
        if (gameRunning) {
            unicorn.x = Math.min(Math.max(unicorn.x, unicorn.radius), width - unicorn.radius);
            unicorn.y = Math.min(Math.max(unicorn.y, unicorn.radius), height - unicorn.radius);
            if (!error404.isDead) {
                error404.x = Math.min(Math.max(error404.x, error404.radius), width - error404.radius);
                error404.y = Math.min(Math.max(error404.y, error404.radius), height - error404.radius);
            }
        }
    });
    document.getElementById('restartBtn').addEventListener('click', () => {
        if (!gameRunning) restartGame();
        else { gameRunning = false; restartGame(); }
    });
    canvas.addEventListener('mousemove', handleMouseMove);

    resizeCanvas();
    error404.x = width/2; error404.y = 80;
    unicorn.x = width/2; unicorn.y = height - 80;
    restartGame();
    requestAnimationFrame(animate);
})();
