// CHAVE DA API GEOAPIFY
const apiKey = '435bf07fb6d444f8a0ca1af6906f1bce';

// ======================================================
// LINKS DO STRIPE
// ======================================================
const STRIPE_LINK_BASICO = 'https://buy.stripe.com/test_00w9AT3P32hIggO15a5EY01'; 
const STRIPE_LINK_PREMIUM = 'https://buy.stripe.com/test_00w3cv0CR4pQfcKcNS5EY00'; 
// ======================================================


// ======================================================
// INICIALIZAÇÃO DO APPWRITE
// ======================================================
const { Client, Account, ID, Databases, Storage, Query, Permission, Role } = Appwrite;

const client = new Client();
client
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('691771230014ab7e6072');

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// IDs do Appwrite
const DB_ID = '6917721d002bc00da375';
const USERS_COLLECTION_ID = 'users';
const RENTERS_COLLECTION_ID = 'locations'; 
const EQUIPMENT_COLLECTION_ID = 'products';
const BUCKET_ID = 'product-images';
const FAVORITES_COLLECTION_ID = 'favorites'; 
const REVIEWS_COLLECTION_ID = 'reviews'; // ⚠️ ID DA NOVA TABELA DE REVIEWS

// Variáveis de sessão globais
let currentSession = {
    isLoggedIn: false,
    isRenter: false,
    account: null, 
    profile: null 
};

// Variáveis temporárias
let currentContactPhone = '';
let currentReviewRenterId = '';
let currentRating = 0;

// ======================================================

// LIMITES DOS PLANOS
const planLimits = {
    free: { max: 1, editLock: true },
    basic: { max: 10, editLock: false },
    premium: { max: 20, editLock: false }
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const secret = urlParams.get('secret');

    if (userId && secret) {
        console.log("Detectado fluxo de recuperação de senha.");
        showScreen('reset-password-screen');
    } else {
        initializeApp();
    }
});

async function initializeApp() {
    try {
        const loggedInAccount = await account.get();
        let isRenter = false;
        let profileDoc;

        try {
            profileDoc = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, loggedInAccount.$id);
            isRenter = true;
        } catch (e) {
            try {
                 profileDoc = await databases.getDocument(DB_ID, USERS_COLLECTION_ID, loggedInAccount.$id);
            } catch (userError) {
                console.error("Conta logada não encontrada em 'users' nem 'renters'", userError);
                await account.deleteSession('current'); 
                showScreen('home-screen');
                return;
            }
        }

        currentSession = {
            isLoggedIn: true,
            isRenter: isRenter,
            account: loggedInAccount,
            profile: profileDoc
        };

        if (isRenter) {
            showScreen('renter-dashboard');
        } else {
            showScreen('user-location-select');
        }
        
    } catch (error) {
        console.log("Nenhuma sessão ativa.");
        showScreen('home-screen');
    }
}


// --- NAVEGAÇÃO E ALERTAS ---

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    if (screenId === 'user-location-select') { loadStates('user-state-select'); }
    if (screenId === 'user-profile') { loadUserProfile(); }
    if (screenId === 'renter-dashboard') { loadRenterDashboard(); }
    if (screenId === 'renter-profile') { loadRenterProfile(); }
    if (screenId === 'upgrade-plan') { highlightCurrentPlan(); }
    if (screenId === 'user-favorites') { loadFavoritesScreen(); }
    
    const element = document.getElementById(screenId);
    if (element) {
        element.classList.add('active');
    } else {
        console.error(`Erro: Tela com ID '${screenId}' não encontrada.`);
    }

    if (screenId === 'user-dashboard' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100); 
    }
}

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('global-alert');
    alertBox.textContent = message;
    alertBox.className = `alert-${type}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 6000);
}


// --- AUTENTICAÇÃO E SESSÃO (Mantido igual) ---
// ... (Funções userRegister, renterRegister, userLogin, renterLogin, recoverPassword, finishPasswordReset, logout iguais)
async function userRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-user-name').value;
    const phone = document.getElementById('reg-user-phone').value;
    const street = document.getElementById('reg-user-street').value;
    const neighborhood = document.getElementById('reg-user-neighborhood').value;
    const city = document.getElementById('reg-user-city').value;
    const state = document.getElementById('reg-user-state').value;
    const email = document.getElementById('reg-user-email').value;
    const password = document.getElementById('reg-user-password').value;
    const confirmPassword = document.getElementById('reg-user-confirm-password').value;

    if (password !== confirmPassword) return showAlert('As senhas não conferem.');
    if (!street || !city || !state) return showAlert('Endereço inválido.');

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        const userData = { name, phone, street, neighborhood, city, state, email, userId: authUser.$id };
        await databases.createDocument(DB_ID, USERS_COLLECTION_ID, authUser.$id, userData);
        await account.createEmailSession(email, password);
        showAlert('Usuário cadastrado!', 'success');
        initializeApp();
    } catch (error) { showAlert(`Erro no cadastro: ${error.message}`); }
}

async function renterRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-renter-name').value;
    const phone = document.getElementById('reg-renter-phone').value;
    const street = document.getElementById('reg-renter-street').value;
    const neighborhood = document.getElementById('reg-renter-neighborhood').value;
    const city = document.getElementById('reg-renter-city').value;
    const state = document.getElementById('reg-renter-state').value;
    const lat = parseFloat(document.getElementById('reg-renter-lat').value);
    const lng = parseFloat(document.getElementById('reg-renter-lng').value);
    const email = document.getElementById('reg-renter-email').value;
    const password = document.getElementById('reg-renter-password').value;
    const confirmPassword = document.getElementById('reg-renter-confirm-password').value;
    
    if (password !== confirmPassword) return showAlert('As senhas não conferem.');
    if (!street || !city || !state) return showAlert('Endereço inválido.');

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        const renterData = { name, phone, street, neighborhood, city, state, lat, lng, email, plan: 'free', renterId: authUser.$id };
        await databases.createDocument(DB_ID, RENTERS_COLLECTION_ID, authUser.$id, renterData);
        await account.createEmailSession(email, password);
        showAlert('Locador cadastrado!', 'success');
        initializeApp();
    } catch (error) { showAlert(`Erro no cadastro: ${error.message}`); }
}

async function userLogin(event) {
    event.preventDefault();
    try {
        await account.createEmailSession(document.getElementById('user-email').value, document.getElementById('user-password').value);
        const acc = await account.get();
        await databases.getDocument(DB_ID, USERS_COLLECTION_ID, acc.$id);
        showAlert('Login sucesso!', 'success');
        initializeApp();
    } catch (error) { showAlert('Login inválido ou conta errada.'); await account.deleteSession('current').catch(()=>{}); }
}

async function renterLogin(event) {
    event.preventDefault();
    try {
        await account.createEmailSession(document.getElementById('renter-email').value, document.getElementById('renter-password').value);
        const acc = await account.get();
        await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, acc.$id);
        showAlert('Login sucesso!', 'success');
        initializeApp();
    } catch (error) { showAlert('Login inválido ou conta errada.'); await account.deleteSession('current').catch(()=>{}); }
}

async function recoverPassword(event, type) {
    event.preventDefault();
    const inputId = (type === 'user') ? 'recover-user-email' : 'recover-renter-email';
    const email = document.getElementById(inputId).value.trim();
    if (!email) return showAlert('E-mail inválido.');
    try {
        const urlObj = new URL(window.location.href);
        await account.createRecovery(email, `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`);
        showAlert('Link enviado!', 'success');
        showScreen((type === 'user') ? 'user-login' : 'renter-login');
    } catch (error) { console.error(error); showAlert('Erro ao enviar link.'); }
}

async function finishPasswordReset(event) {
    event.preventDefault();
    const p1 = document.getElementById('new-password').value;
    if (p1 !== document.getElementById('confirm-new-password').value) return showAlert('Senhas não conferem.');
    const params = new URLSearchParams(window.location.search);
    if (!params.get('userId') || !params.get('secret')) return showAlert('Link inválido.');
    try {
        await account.updateRecovery(params.get('userId'), params.get('secret'), p1, p1);
        showAlert('Senha alterada!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
        showScreen('home-screen');
    } catch (error) { alert(`Erro: ${error.message}`); }
}

async function logout() {
    try { await account.deleteSession('current'); } catch (e) {}
    currentSession = { isLoggedIn: false, isRenter: false, account: null, profile: null };
    showAlert('Saiu.', 'success');
    showScreen('home-screen');
}

// --- PERFIS (Mantido igual) ---
function loadUserProfile() {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return;
    const u = currentSession.profile;
    document.getElementById('edit-user-name').value = u.name;
    document.getElementById('edit-user-phone').value = u.phone;
    document.getElementById('edit-user-street').value = u.street;
    document.getElementById('edit-user-neighborhood').value = u.neighborhood;
    document.getElementById('edit-user-city').value = u.city;
    document.getElementById('edit-user-state').value = u.state;
    document.getElementById('edit-user-email').value = u.email;
}
async function updateUserProfile(event) {
    event.preventDefault();
    if (!currentSession.isLoggedIn || currentSession.isRenter) return;
    try {
        await databases.updateDocument(DB_ID, USERS_COLLECTION_ID, currentSession.profile.$id, {
            name: document.getElementById('edit-user-name').value,
            phone: document.getElementById('edit-user-phone').value,
            street: document.getElementById('edit-user-street').value,
            neighborhood: document.getElementById('edit-user-neighborhood').value,
            city: document.getElementById('edit-user-city').value,
            state: document.getElementById('edit-user-state').value
        });
        currentSession.profile = await databases.getDocument(DB_ID, USERS_COLLECTION_ID, currentSession.profile.$id);
        showAlert('Atualizado!', 'success'); showScreen('user-dashboard');
    } catch (e) { showAlert(`Erro: ${e.message}`); }
}
function loadRenterProfile() {
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    const r = currentSession.profile;
    document.getElementById('edit-renter-name').value = r.name;
    document.getElementById('edit-renter-phone').value = r.phone;
    document.getElementById('edit-renter-street').value = r.street;
    document.getElementById('edit-renter-neighborhood').value = r.neighborhood;
    document.getElementById('edit-renter-city').value = r.city;
    document.getElementById('edit-renter-state').value = r.state;
    document.getElementById('edit-renter-email').value = r.email;
}
async function updateRenterProfile(event) {
    event.preventDefault();
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    try {
        await databases.updateDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.profile.$id, {
            name: document.getElementById('edit-renter-name').value,
            phone: document.getElementById('edit-renter-phone').value,
            street: document.getElementById('edit-renter-street').value,
            neighborhood: document.getElementById('edit-renter-neighborhood').value,
            city: document.getElementById('edit-renter-city').value,
            state: document.getElementById('edit-renter-state').value,
            lat: parseFloat(document.getElementById('reg-renter-lat').value),
            lng: parseFloat(document.getElementById('reg-renter-lng').value)
        });
        currentSession.profile = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.profile.$id);
        showAlert('Atualizado!', 'success'); showScreen('renter-dashboard');
    } catch (e) { showAlert(`Erro: ${e.message}`); }
}

// --- DASHBOARD LOCADOR ---
async function loadRenterDashboard() {
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    try { currentSession.profile = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.account.$id); } catch (e) { logout(); }
    loadPlanInfo();
    loadEquipmentList();
}
async function loadPlanInfo() {
    try {
        const list = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', currentSession.profile.$id)]);
        const limit = planLimits[currentSession.profile.plan].max;
        document.getElementById('plan-info').innerHTML = `<h3>Plano ${currentSession.profile.plan}</h3><p>Itens: ${list.total} / ${limit}</p>`;
    } catch (e) {}
}
async function loadEquipmentList() {
    const listContainer = document.getElementById('equipment-list');
    listContainer.innerHTML = '';
    try {
        const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', currentSession.profile.$id)]);
        if (res.documents.length === 0) { listContainer.innerHTML = '<p>Vazio.</p>'; return; }
        res.documents.forEach(eq => {
            const isAv = (eq.isAvailable !== false);
            listContainer.innerHTML += `
                <div class="equipment-card">
                    <img src="${eq.imageUrl || 'https://via.placeholder.com/120'}" alt="${eq.name}">
                    <div class="equipment-info">
                        <span class="status-badge ${isAv?'status-available':'status-rented'}">${isAv?'DISPONÍVEL':'ALUGADO'}</span>
                        <h4>${eq.name}</h4>
                        <p>R$ ${eq.price}</p>
                        <div class="equipment-actions">
                            <button class="toggle-btn" onclick="toggleEquipmentStatus('${eq.$id}', ${isAv})">${isAv?'Marcar Alugado':'Marcar Disponível'}</button>
                            <button class="edit-btn" onclick="editEquipment('${eq.$id}')">Editar</button>
                            <button class="delete-btn" onclick="deleteEquipment('${eq.$id}')">Excluir</button>
                        </div>
                    </div>
                </div>`;
        });
    } catch (e) { listContainer.innerHTML = '<p>Erro.</p>'; }
}
async function toggleEquipmentStatus(id, status) {
    try { await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, { isAvailable: !status }); loadEquipmentList(); } catch (e) { showAlert('Erro ao mudar status.'); }
}
function prepareAddEquipmentForm() {
    document.getElementById('add-equipment').querySelector('form').reset();
    document.getElementById('equipment-id').value = ''; document.getElementById('image-preview').innerHTML = '';
    showScreen('add-equipment');
}
async function saveEquipment(event) {
    event.preventDefault();
    const id = document.getElementById('equipment-id').value;
    const file = document.getElementById('equipment-image').files[0];
    let imgUrl = null;
    try {
        if (file) {
            const up = await storage.createFile(BUCKET_ID, ID.unique(), file, [Permission.read(Role.any())]);
            imgUrl = storage.getFileView(BUCKET_ID, up.$id).href;
        }
        const data = {
            renterId: currentSession.profile.$id, renterName: currentSession.profile.name,
            city: currentSession.profile.city, state: currentSession.profile.state,
            lat: currentSession.profile.lat, lng: currentSession.profile.lng,
            name: document.getElementById('equipment-name').value,
            description: document.getElementById('equipment-description').value,
            price: parseFloat(document.getElementById('equipment-price').value),
            voltage: document.getElementById('equipment-voltage').value,
            isAvailable: true
        };
        if (imgUrl) data.imageUrl = imgUrl;
        if (id) {
            if (!imgUrl) delete data.imageUrl; delete data.isAvailable;
            await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, data);
        } else {
            const check = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', currentSession.profile.$id)]);
            if (check.total >= planLimits[currentSession.profile.plan].max) { showAlert('Limite atingido.'); return showScreen('upgrade-plan'); }
            await databases.createDocument(DB_ID, EQUIPMENT_COLLECTION_ID, ID.unique(), data);
        }
        showAlert('Salvo!', 'success'); showScreen('renter-dashboard');
    } catch (e) { showAlert(`Erro: ${e.message}`); }
}
async function deleteEquipment(id) {
    if (confirm('Excluir?')) {
        try { await databases.deleteDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id); loadEquipmentList(); } catch (e) { showAlert('Erro.'); }
    }
}
async function editEquipment(id) {
    try {
        const eq = await databases.getDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id);
        document.getElementById('equipment-id').value = eq.$id;
        document.getElementById('equipment-name').value = eq.name;
        document.getElementById('equipment-description').value = eq.description;
        document.getElementById('equipment-price').value = eq.price;
        document.getElementById('equipment-voltage').value = eq.voltage;
        showScreen('add-equipment');
    } catch (e) {}
}
function previewImage(e) {
    if (e.target.files[0]) { const r = new FileReader(); r.onload=(ev)=>document.getElementById('image-preview').innerHTML=`<img src="${ev.target.result}">`; r.readAsDataURL(e.target.files[0]); }
}
// Stripe e Planos mantidos iguais... (selectPlan, highlightCurrentPlan)

// --- BUSCA USUÁRIO & SISTEMA DE AVALIAÇÃO ---

async function searchEquipment() {
    const state = document.getElementById('user-state-select').value;
    const city = document.getElementById('user-city-select').value;
    const term = document.getElementById('equipment-select').value.toLowerCase();
    const volt = document.getElementById('filter-voltage').value;
    const price = document.getElementById('filter-max-price').value;
    
    const resDiv = document.getElementById('equipment-results');
    resDiv.innerHTML = '<div class="spinner"></div>'; markersLayer.clearLayers();

    const q = [Query.equal('state', state), Query.equal('city', city)];
    if (term) q.push(Query.equal('name', term));
    if (volt) q.push(Query.equal('voltage', volt));
    if (price) q.push(Query.lessThanEqual('price', parseFloat(price)));

    try {
        const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, q);
        
        // Busca favoritos
        let favs = [];
        if (currentSession.isLoggedIn && !currentSession.isRenter) {
            try {
                const f = await databases.listDocuments(DB_ID, FAVORITES_COLLECTION_ID, [Query.equal('userId', currentSession.account.$id)]);
                favs = f.documents.map(x => x.equipmentId);
            } catch(e) { console.log(e); }
        }

        if (res.documents.length === 0) { resDiv.innerHTML = '<p>Nada encontrado.</p>'; return; }
        resDiv.innerHTML = ''; const bounds = [];

        for (const eq of res.documents) {
            const isAv = (eq.isAvailable !== false);
            const isFav = favs.includes(eq.$id);
            
            // Adiciona Card com Placeholder de Estrelas
            const div = document.createElement('div');
            div.className = `result-card ${isAv?'':'card-unavailable'}`;
            div.innerHTML = `
                <div class="card-image-container">
                    <img src="${eq.imageUrl || 'https://via.placeholder.com/300x200'}" alt="${eq.name}">
                    <button class="btn-favorite ${isFav?'active':''}" onclick="toggleFavorite('${eq.$id}', this)">${isFav?'❤️':'🤍'}</button>
                </div>
                ${isAv?'':'<span class="status-badge status-rented">ALUGADO</span>'}
                <h3>${eq.name}</h3>
                <div id="rating-${eq.renterId}" class="rating-display">⭐ Carregando nota...</div>
                <p><strong>${eq.renterName}</strong> - ${eq.city}</p>
                <p>${eq.description}</p>
                <p class="price">R$ ${eq.price} / dia</p>
                <button class="btn ${isAv?'btn-secondary':'btn-secondary disabled'} contact-btn" onclick="contactRenter('${eq.renterId}', '${eq.name}')">📞 Contato</button>
                <button class="btn btn-rate" onclick="openReviewModal('${eq.renterId}')" style="margin-top:5px; font-size:0.8rem;">⭐ Avaliar Locador</button>
            `;
            resDiv.appendChild(div);

            if (eq.lat) { const ll=[eq.lat, eq.lng]; L.marker(ll).addTo(markersLayer).bindPopup(eq.name); bounds.push(ll); }
            
            // Carrega a nota de forma assíncrona para não travar a lista
            loadRenterRating(eq.renterId); 
        }
        if (bounds.length) map.fitBounds(bounds, {padding:[50,50]});

    } catch (e) { console.error(e); resDiv.innerHTML = '<p>Erro na busca.</p>'; }
}

// --- LÓGICA DE AVALIAÇÃO (ESTRELAS) ---

async function loadRenterRating(renterId) {
    try {
        // Busca todas as avaliações desse locador
        const res = await databases.listDocuments(DB_ID, REVIEWS_COLLECTION_ID, [
            Query.equal('renterId', renterId)
        ]);
        
        const elements = document.querySelectorAll(`#rating-${renterId}`);
        
        if (res.total === 0) {
            elements.forEach(el => el.innerHTML = '<span style="color:#999; font-weight:normal;">(Sem avaliações)</span>');
            return;
        }

        // Calcula Média
        const sum = res.documents.reduce((acc, rev) => acc + rev.stars, 0);
        const avg = (sum / res.total).toFixed(1);
        
        elements.forEach(el => el.innerHTML = `⭐ ${avg} (${res.total} avaliações)`);

    } catch (error) {
        console.error("Erro ao carregar nota:", error);
    }
}

function openReviewModal(renterId) {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return showAlert('Faça login como usuário para avaliar.');
    currentReviewRenterId = renterId;
    currentRating = 0;
    document.getElementById('review-comment').value = '';
    updateStarVisuals(0);
    document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() {
    document.getElementById('review-modal').style.display = 'none';
}

function selectStar(n) {
    currentRating = n;
    updateStarVisuals(n);
}

function updateStarVisuals(n) {
    const stars = document.querySelectorAll('.star-rating-input .star');
    stars.forEach((star, index) => {
        if (index < n) star.classList.add('filled');
        else star.classList.remove('filled');
    });
}

async function submitReview() {
    if (currentRating === 0) return showAlert('Selecione as estrelas!');
    
    try {
        await databases.createDocument(DB_ID, REVIEWS_COLLECTION_ID, ID.unique(), {
            renterId: currentReviewRenterId,
            userId: currentSession.account.$id,
            stars: currentRating,
            comment: document.getElementById('review-comment').value
        });
        
        showAlert('Avaliação enviada!', 'success');
        closeReviewModal();
        loadRenterRating(currentReviewRenterId); // Atualiza visualmente
        
    } catch (error) {
        console.error(error);
        showAlert('Erro ao enviar avaliação.');
    }
}

// --- FUNÇÕES AUXILIARES RESTANTES (Geoapify, Favorites, Contact) ---
// Mantidas do passo anterior, apenas garantindo que contactRenter chame o modal certo
async function contactRenter(renterId, equipmentName) {
    try {
        const renter = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, renterId);
        document.getElementById('modal-renter-name').textContent = renter.name;
        document.getElementById('modal-phone-display').textContent = renter.phone;
        currentContactPhone = renter.phone;
        const clean = renter.phone.replace(/\D/g, '');
        document.getElementById('btn-action-call').href = `tel:${clean}`;
        document.getElementById('btn-action-whatsapp').href = `https://wa.me/55${clean}?text=${encodeURIComponent('Olá '+renter.name+', vi '+equipmentName+' no LocaMaq.')}`;
        document.getElementById('contact-modal').style.display = 'flex';
    } catch (e) { showAlert('Erro ao carregar locador.'); }
}
// ... (restante das funções de favoritos e geoapify iguais)
async function toggleFavorite(equipmentId, btnElement) {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return showAlert('Faça login como usuário.');
    const userId = currentSession.account.$id;
    const isActive = btnElement.classList.contains('active');
    try {
        if (isActive) {
            const res = await databases.listDocuments(DB_ID, FAVORITES_COLLECTION_ID, [Query.equal('userId', userId), Query.equal('equipmentId', equipmentId)]);
            if (res.documents.length > 0) { await databases.deleteDocument(DB_ID, FAVORITES_COLLECTION_ID, res.documents[0].$id); btnElement.classList.remove('active'); btnElement.innerHTML='🤍'; }
        } else {
            await databases.createDocument(DB_ID, FAVORITES_COLLECTION_ID, ID.unique(), { userId, equipmentId });
            btnElement.classList.add('active'); btnElement.innerHTML='❤️';
        }
    } catch (e) { console.error(e); showAlert('Erro favorito.'); }
}
// ... (loadFavoritesScreen, geoapify functions, loadStates/Cities iguais aos anteriores)