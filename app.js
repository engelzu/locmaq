// ======================================================
// CONFIGURAÇÕES GERAIS E CHAVES
// ======================================================
const apiKey = '435bf07fb6d444f8a0ca1af6906f1bce'; // Geoapify

// Links do Stripe
const STRIPE_LINK_BASICO = 'https://buy.stripe.com/test_00w9AT3P32hIggO15a5EY01'; 
const STRIPE_LINK_PREMIUM = 'https://buy.stripe.com/test_00w3cv0CR4pQfcKcNS5EY00'; 

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

// IDs das Coleções (Tabelas)
const DB_ID = '6917721d002bc00da375';
const USERS_COLLECTION_ID = 'users';
const RENTERS_COLLECTION_ID = 'locations'; // Tabela de Locadores (ID original 'locations')
const EQUIPMENT_COLLECTION_ID = 'products'; // Tabela de Equipamentos
const BUCKET_ID = 'product-images';
const FAVORITES_COLLECTION_ID = 'favorites'; 
const REVIEWS_COLLECTION_ID = 'reviews'; 

// Variáveis Globais de Sessão
let currentSession = {
    isLoggedIn: false,
    isRenter: false,
    account: null, 
    profile: null 
};

// Variáveis Temporárias
let currentContactPhone = '';
let currentReviewRenterId = '';
let currentRating = 0;

// Limites dos Planos
const planLimits = {
    free: { max: 1, editLock: true },
    basic: { max: 10, editLock: false },
    premium: { max: 20, editLock: false }
};

// ======================================================
// INICIALIZAÇÃO DO SISTEMA
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
    console.log("Sistema Iniciado.");
    
    // Verifica se é retorno de recuperação de senha
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
        // 1. Verifica se tem sessão ativa no Auth
        const loggedInAccount = await account.get();
        console.log("Sessão Auth encontrada:", loggedInAccount.$id);
        
        let isRenter = false;
        let profileDoc;

        // 2. Tenta achar no banco de Locadores
        try {
            profileDoc = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, loggedInAccount.$id);
            isRenter = true;
            console.log("Perfil Locador encontrado.");
        } catch (e) {
            // 3. Se não achar, tenta no banco de Usuários
            try {
                 profileDoc = await databases.getDocument(DB_ID, USERS_COLLECTION_ID, loggedInAccount.$id);
                 console.log("Perfil Usuário encontrado.");
            } catch (userError) {
                // 4. Se não achar em nenhum, é uma conta fantasma (apaga a sessão)
                console.error("Conta existe no Auth mas não no Banco de Dados.", userError);
                await account.deleteSession('current'); 
                showScreen('home-screen');
                return;
            }
        }

        // 5. Salva a sessão globalmente
        currentSession = {
            isLoggedIn: true,
            isRenter: isRenter,
            account: loggedInAccount,
            profile: profileDoc
        };

        // 6. Redireciona para a tela certa
        if (isRenter) {
            showScreen('renter-dashboard');
        } else {
            showScreen('user-location-select');
        }
        
    } catch (error) {
        console.log("Nenhuma sessão ativa (Usuário deslogado).");
        showScreen('home-screen');
    }
}

// ======================================================
// NAVEGAÇÃO E ALERTAS
// ======================================================
function showScreen(screenId) {
    // Esconde todas as telas
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Lógicas específicas ao abrir certas telas
    if (screenId === 'user-location-select') { loadStates('user-state-select'); }
    if (screenId === 'user-profile') { loadUserProfile(); }
    if (screenId === 'renter-dashboard') { loadRenterDashboard(); }
    if (screenId === 'renter-profile') { loadRenterProfile(); }
    if (screenId === 'upgrade-plan') { highlightCurrentPlan(); }
    if (screenId === 'user-favorites') { loadFavoritesScreen(); }
    
    // Mostra a tela desejada
    const element = document.getElementById(screenId);
    if (element) {
        element.classList.add('active');
    } else {
        console.error(`ERRO CRÍTICO: Tela com ID '${screenId}' não existe no HTML.`);
    }

    // Corrige tamanho do mapa se ele estiver na tela
    if (screenId === 'user-dashboard' && map) {
        setTimeout(() => { map.invalidateSize(); }, 100); 
    }
}

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('global-alert');
    alertBox.textContent = message;
    alertBox.className = `alert-${type}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 5000);
}

// ======================================================
// AUTENTICAÇÃO (LOGIN/CADASTRO)
// ======================================================

async function userLogin(event) {
    event.preventDefault();
    console.log("DEBUG: Tentando login de Usuário...");
    
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;

    try {
        // Cria sessão
        await account.createEmailSession(email, password);
        
        // Verifica se o perfil existe na tabela 'users'
        const acc = await account.get();
        await databases.getDocument(DB_ID, USERS_COLLECTION_ID, acc.$id);
        
        showAlert('Login realizado com sucesso!', 'success');
        initializeApp();
    } catch (error) {
        console.error("Erro no login:", error);
        showAlert('E-mail ou senha inválidos, ou esta conta não é de usuário.');
        // Se criou sessão mas não achou o doc, desloga
        await account.deleteSession('current').catch(()=>{}); 
    }
}

async function renterLogin(event) {
    event.preventDefault();
    console.log("DEBUG: Tentando login de Locador...");

    const email = document.getElementById('renter-email').value;
    const password = document.getElementById('renter-password').value;

     try {
        await account.createEmailSession(email, password);
        
        const acc = await account.get();
        await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, acc.$id);
        
        showAlert('Login realizado com sucesso!', 'success');
        initializeApp();
    } catch (error) {
        console.error("Erro no login:", error);
        showAlert('E-mail ou senha inválidos, ou esta conta não é de locador.');
        await account.deleteSession('current').catch(()=>{}); 
    }
}

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
    if (!street || !city || !state) return showAlert('Endereço incompleto.');

    try {
        // 1. Cria conta Auth
        const authUser = await account.create(ID.unique(), email, password, name);
        
        // 2. Cria documento no Banco
        const userData = { name, phone, street, neighborhood, city, state, email, userId: authUser.$id };
        await databases.createDocument(DB_ID, USERS_COLLECTION_ID, authUser.$id, userData);
        
        // 3. Loga automaticamente
        await account.createEmailSession(email, password);
        
        showAlert('Usuário cadastrado!', 'success');
        initializeApp();
    } catch (error) {
        console.error(error);
        showAlert(`Erro no cadastro: ${error.message}`);
    }
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
    if (!street || !city || !state) return showAlert('Endereço incompleto.');

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        
        const renterData = { 
            name, phone, street, neighborhood, city, state, lat, lng, email, 
            plan: 'free', 
            renterId: authUser.$id 
        };
        await databases.createDocument(DB_ID, RENTERS_COLLECTION_ID, authUser.$id, renterData);
        
        await account.createEmailSession(email, password);
        
        showAlert('Locador cadastrado!', 'success');
        initializeApp();
    } catch (error) {
        console.error(error);
        showAlert(`Erro no cadastro: ${error.message}`);
    }
}

// --- RECUPERAÇÃO DE SENHA ---

async function recoverPassword(event, type) {
    event.preventDefault();
    const inputId = (type === 'user') ? 'recover-user-email' : 'recover-renter-email';
    const email = document.getElementById(inputId).value.trim();
    
    if (!email) return showAlert('Digite um e-mail válido.');

    try {
        const urlObj = new URL(window.location.href);
        const resetUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`; 
        
        await account.createRecovery(email, resetUrl);
        
        showAlert('Link enviado! Verifique a Caixa de Entrada e SPAM.', 'success');
        showScreen((type === 'user') ? 'user-login' : 'renter-login');
    } catch (error) {
         console.error("Erro recuperação:", error);
         if (error.code === 404) {
             alert('Este e-mail não está cadastrado.');
         } else {
             alert(`Erro ao enviar: ${error.message}`);
         }
    }
}

async function finishPasswordReset(event) {
    event.preventDefault();
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-new-password').value;
    
    if (password !== confirm) return showAlert('As senhas não conferem.');

    const params = new URLSearchParams(window.location.search);
    const userId = params.get('userId');
    const secret = params.get('secret');

    if (!userId || !secret) return showAlert('Link inválido.');

    try {
        await account.updateRecovery(userId, secret, password, password);
        showAlert('Senha alterada com sucesso!', 'success');
        window.history.replaceState({}, document.title, window.location.pathname);
        showScreen('home-screen');
    } catch (error) {
        alert(`Erro ao salvar senha: ${error.message}`);
    }
}

async function logout() {
    try { await account.deleteSession('current'); } catch (e) {}
    currentSession = { isLoggedIn: false, isRenter: false, account: null, profile: null };
    showAlert('Você saiu.', 'success');
    showScreen('home-screen');
}

// ======================================================
// PERFIS (USUÁRIO E LOCADOR)
// ======================================================

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
        showAlert('Perfil atualizado!', 'success'); 
        showScreen('user-dashboard');
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
        showAlert('Perfil atualizado!', 'success'); 
        showScreen('renter-dashboard');
    } catch (e) { showAlert(`Erro: ${e.message}`); }
}

// ======================================================
// DASHBOARD DO LOCADOR
// ======================================================

async function loadRenterDashboard() {
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    // Atualiza perfil para garantir dados frescos
    try { currentSession.profile = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.account.$id); } catch (e) { logout(); }
    
    loadPlanInfo();
    loadEquipmentList();
}

async function loadPlanInfo() {
    try {
        const list = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [
            Query.equal('renterId', currentSession.profile.$id)
        ]);
        const limit = planLimits[currentSession.profile.plan].max;
        document.getElementById('plan-info').innerHTML = `<h3>Plano ${currentSession.profile.plan}</h3><p>Itens: ${list.total} / ${limit}</p>`;
    } catch (e) { console.error(e); }
}

async function loadEquipmentList() {
    const listContainer = document.getElementById('equipment-list');
    listContainer.innerHTML = '';
    try {
        const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [
            Query.equal('renterId', currentSession.profile.$id)
        ]);
        
        if (res.documents.length === 0) { listContainer.innerHTML = '<p>Nenhum equipamento.</p>'; return; }
        
        res.documents.forEach(eq => {
            const isAv = (eq.isAvailable !== false); // Padrão é true
            const imageUrl = eq.imageUrl || 'https://via.placeholder.com/120';
            
            listContainer.innerHTML += `
                <div class="equipment-card">
                    <img src="${imageUrl}" alt="${eq.name}">
                    <div class="equipment-info">
                        <span class="status-badge ${isAv?'status-available':'status-rented'}">${isAv?'DISPONÍVEL':'ALUGADO'}</span>
                        <h4>${eq.name}</h4>
                        <p>R$ ${eq.price.toFixed(2)}</p>
                        <div class="equipment-actions">
                            <button class="toggle-btn" onclick="toggleEquipmentStatus('${eq.$id}', ${isAv})">${isAv?'Marcar Alugado':'Marcar Disponível'}</button>
                            <button class="edit-btn" onclick="editEquipment('${eq.$id}')">Editar</button>
                            <button class="delete-btn" onclick="deleteEquipment('${eq.$id}')">Excluir</button>
                        </div>
                    </div>
                </div>`;
        });
    } catch (e) { listContainer.innerHTML = '<p>Erro ao carregar.</p>'; }
}

async function toggleEquipmentStatus(id, currentStatus) {
    try {
        await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, { isAvailable: !currentStatus });
        loadEquipmentList();
    } catch (e) { showAlert('Erro ao mudar status.'); }
}

// ======================================================
// GERENCIAMENTO DE EQUIPAMENTOS
// ======================================================

function prepareAddEquipmentForm() {
    const form = document.getElementById('add-equipment').querySelector('form');
    if(form) form.reset();
    document.getElementById('equipment-form-title').textContent = 'Adicionar Equipamento';
    document.getElementById('equipment-id').value = ''; 
    document.getElementById('image-preview').innerHTML = '';
    showScreen('add-equipment');
}

async function saveEquipment(event) {
    event.preventDefault();
    const renter = currentSession.profile;
    const id = document.getElementById('equipment-id').value;
    const file = document.getElementById('equipment-image').files[0];
    let imgUrl = null;

    try {
        if (file) {
            const up = await storage.createFile(BUCKET_ID, ID.unique(), file, [Permission.read(Role.any())]);
            imgUrl = storage.getFileView(BUCKET_ID, up.$id).href;
        }

        const data = {
            renterId: renter.$id, 
            renterName: renter.name,
            city: renter.city, 
            state: renter.state,
            lat: renter.lat, 
            lng: renter.lng,
            name: document.getElementById('equipment-name').value,
            description: document.getElementById('equipment-description').value,
            price: parseFloat(document.getElementById('equipment-price').value),
            voltage: document.getElementById('equipment-voltage').value,
            isAvailable: true
        };

        if (imgUrl) data.imageUrl = imgUrl;

        if (id) {
            if (!imgUrl) delete data.imageUrl;
            delete data.isAvailable; // Não altera status na edição
            await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, data);
            showAlert('Equipamento atualizado!', 'success');
        } else {
            // Verifica limite do plano
            const check = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', renter.$id)]);
            if (check.total >= planLimits[renter.plan].max) {
                showAlert('Limite do plano atingido.', 'warning'); 
                return showScreen('upgrade-plan'); 
            }
            
            await databases.createDocument(DB_ID, EQUIPMENT_COLLECTION_ID, ID.unique(), data);
            showAlert('Equipamento salvo!', 'success');
        }
        showScreen('renter-dashboard');
    } catch (e) { showAlert(`Erro ao salvar: ${e.message}`); }
}

async function deleteEquipment(id) {
    if (confirm('Tem certeza que deseja excluir?')) {
        try {
            // Tenta excluir imagem (opcional)
            try {
                const eq = await databases.getDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id);
                if (eq.imageUrl) {
                    const fileId = new URL(eq.imageUrl).pathname.split('/files/')[1].split('/')[0];
                    await storage.deleteFile(BUCKET_ID, fileId);
                }
            } catch (e) {}
            
            await databases.deleteDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id);
            showAlert('Equipamento excluído.', 'success');
            loadEquipmentList(); 
        } catch (e) { showAlert('Erro ao excluir.'); }
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
        
        const preview = document.getElementById('image-preview');
        preview.innerHTML = eq.imageUrl ? `<img src="${eq.imageUrl}" alt="Prévia">` : '';
        
        showScreen('add-equipment');
    } catch (e) { showAlert(`Erro: ${e.message}`); }
}

function previewImage(e) {
    if (e.target.files[0]) {
        const r = new FileReader(); 
        r.onload = (ev) => document.getElementById('image-preview').innerHTML=`<img src="${ev.target.result}">`; 
        r.readAsDataURL(e.target.files[0]); 
    }
}

// ======================================================
// PAGAMENTOS E PLANOS
// ======================================================

async function selectPlan(planName) {
    if (planName === 'free') return showAlert('Você já está no plano Grátis.', 'warning');
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return showAlert("Faça login como locador.");
    
    const renter = currentSession.profile;
    let stripeUrl = (planName === 'basic') ? STRIPE_LINK_BASICO : STRIPE_LINK_PREMIUM;
    
    if (!stripeUrl || !stripeUrl.startsWith('https://')) return showAlert('Link de pagamento não configurado.', 'error');
    
    try {
        const url = new URL(stripeUrl);
        url.searchParams.append('prefilled_email', renter.email);
        url.searchParams.append('client_reference_id', renter.$id); 
        window.location.href = url.toString();
    } catch (error) { showAlert("Erro ao processar pagamento."); }
}

function highlightCurrentPlan() {
    const renter = currentSession.profile;
    document.getElementById('btn-plan-free').textContent = 'Selecionar';
    document.getElementById('btn-plan-basic').textContent = 'Assinar';
    document.getElementById('btn-plan-premium').textContent = 'Assinar';
    
    const currentPlanBtn = document.getElementById(`btn-plan-${renter.plan}`);
    if (currentPlanBtn) { 
        currentPlanBtn.textContent = 'Plano Atual'; 
        currentPlanBtn.disabled = true; 
    }
}

// ======================================================
// BUSCA DE USUÁRIO & SISTEMA DE AVALIAÇÃO
// ======================================================

let map; 
let markersLayer = L.layerGroup(); 

function initializeMap() {
    if (!map) { 
        map = L.map('map').setView([-15.78, -47.92], 4); 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(map);
        markersLayer.addTo(map);
    }
}

async function searchRenters(event) {
    event.preventDefault();
    initializeMap();
    await populateEquipmentDropdown(); 
    showScreen('user-dashboard');
    document.getElementById('equipment-results').innerHTML = `<div class="empty-state"><p>Selecione um equipamento e clique em 'Pesquisar'.</p></div>`;
    markersLayer.clearLayers();
}

async function populateEquipmentDropdown() {
    const state = document.getElementById('user-state-select').value;
    const city = document.getElementById('user-city-select').value;
    const select = document.getElementById('equipment-select');
    
    if (!select) return;
    select.innerHTML = '<option value="">-- Carregando... --</option>';

    try {
        const response = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [
            Query.equal('state', state), Query.equal('city', city)
        ]);
        
        const equipmentNames = [...new Set(response.documents.map(eq => eq.name))].sort((a, b) => a.localeCompare(b));
        select.innerHTML = '<option value="">-- Todos os Equipamentos --</option>';
        
        if (equipmentNames.length === 0) select.innerHTML = '<option value="">-- Nenhum equipamento --</option>';
        else equipmentNames.forEach(name => { select.innerHTML += `<option value="${name}">${name}</option>`; });
    } catch (error) { select.innerHTML = '<option value="">-- Erro ao carregar --</option>'; }
}

async function searchEquipment() {
    const state = document.getElementById('user-state-select').value;
    const city = document.getElementById('user-city-select').value;
    const term = document.getElementById('equipment-select').value.toLowerCase();
    const volt = document.getElementById('filter-voltage').value;
    const price = document.getElementById('filter-max-price').value;
    
    const resDiv = document.getElementById('equipment-results');
    resDiv.innerHTML = '<div class="spinner"></div>'; 
    markersLayer.clearLayers();

    const q = [Query.equal('state', state), Query.equal('city', city)];
    if (term) q.push(Query.equal('name', term));
    if (volt) q.push(Query.equal('voltage', volt));
    if (price) q.push(Query.lessThanEqual('price', parseFloat(price)));

    try {
        const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, q);
        
        // Busca favoritos (se logado)
        let favs = [];
        if (currentSession.isLoggedIn && !currentSession.isRenter) {
            try {
                const f = await databases.listDocuments(DB_ID, FAVORITES_COLLECTION_ID, [
                    Query.equal('userId', currentSession.account.$id)
                ]);
                favs = f.documents.map(x => x.equipmentId);
            } catch(e) { console.log("Sem favoritos ou erro:", e); }
        }

        if (res.documents.length === 0) { resDiv.innerHTML = '<p>Nada encontrado.</p>'; return; }
        resDiv.innerHTML = ''; 
        const bounds = [];

        for (const eq of res.documents) {
            const isAv = (eq.isAvailable !== false);
            const isFav = favs.includes(eq.$id);
            
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
                <p class="price">R$ ${eq.price.toFixed(2)} / dia</p>
                <button class="btn ${isAv?'btn-secondary':'btn-secondary disabled'} contact-btn" onclick="contactRenter('${eq.renterId}', '${eq.name}')">📞 Contato</button>
                <button class="btn btn-rate" onclick="openReviewModal('${eq.renterId}')" style="margin-top:5px; font-size:0.8rem;">⭐ Avaliar Locador</button>
            `;
            resDiv.appendChild(div);

            if (eq.lat) { 
                const ll=[eq.lat, eq.lng]; 
                L.marker(ll).addTo(markersLayer).bindPopup(eq.name); 
                bounds.push(ll); 
            }
            
            loadRenterRating(eq.renterId); // Carrega nota
        }
        
        if (bounds.length) map.fitBounds(bounds, {padding:[50,50]});

    } catch (e) { console.error(e); resDiv.innerHTML = '<p>Erro na busca.</p>'; }
}

// --- AVALIAÇÕES ---

async function loadRenterRating(renterId) {
    try {
        const res = await databases.listDocuments(DB_ID, REVIEWS_COLLECTION_ID, [
            Query.equal('renterId', renterId)
        ]);
        
        const elements = document.querySelectorAll(`#rating-${renterId}`);
        if (res.total === 0) {
            elements.forEach(el => el.innerHTML = '<span style="color:#999; font-weight:normal;">(Sem avaliações)</span>');
            return;
        }

        const sum = res.documents.reduce((acc, rev) => acc + rev.stars, 0);
        const avg = (sum / res.total).toFixed(1);
        
        elements.forEach(el => el.innerHTML = `⭐ ${avg} (${res.total} avaliações)`);
    } catch (error) { console.error("Erro nota:", error); }
}

function openReviewModal(renterId) {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return showAlert('Faça login como usuário para avaliar.');
    currentReviewRenterId = renterId;
    currentRating = 0;
    document.getElementById('review-comment').value = '';
    updateStarVisuals(0);
    document.getElementById('review-modal').style.display = 'flex';
}

function closeReviewModal() { document.getElementById('review-modal').style.display = 'none'; }

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
        loadRenterRating(currentReviewRenterId);
    } catch (error) { console.error(error); showAlert('Erro ao enviar avaliação.'); }
}

// --- FAVORITOS ---

async function toggleFavorite(equipmentId, btnElement) {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return showAlert('Faça login como usuário.');
    const userId = currentSession.account.$id;
    const isActive = btnElement.classList.contains('active');
    
    try {
        if (isActive) {
            const res = await databases.listDocuments(DB_ID, FAVORITES_COLLECTION_ID, [
                Query.equal('userId', userId), Query.equal('equipmentId', equipmentId)
            ]);
            if (res.documents.length > 0) {
                await databases.deleteDocument(DB_ID, FAVORITES_COLLECTION_ID, res.documents[0].$id);
                btnElement.classList.remove('active'); btnElement.innerHTML='🤍';
                if (document.querySelector('.screen.active').id === 'user-favorites') loadFavoritesScreen();
            }
        } else {
            await databases.createDocument(DB_ID, FAVORITES_COLLECTION_ID, ID.unique(), { userId, equipmentId });
            btnElement.classList.add('active'); btnElement.innerHTML='❤️';
        }
    } catch (e) { console.error(e); showAlert('Erro favorito.'); }
}

async function loadFavoritesScreen() {
    const list = document.getElementById('favorites-list');
    list.innerHTML = '<div class="spinner"></div>';
    if (!currentSession.isLoggedIn || currentSession.isRenter) return;
    
    try {
        const favs = await databases.listDocuments(DB_ID, FAVORITES_COLLECTION_ID, [Query.equal('userId', currentSession.account.$id)]);
        if (favs.total === 0) { list.innerHTML = '<p>Sem favoritos.</p>'; return; }
        
        list.innerHTML = '';
        for (const f of favs.documents) {
            try {
                const eq = await databases.getDocument(DB_ID, EQUIPMENT_COLLECTION_ID, f.equipmentId);
                list.innerHTML += `
                    <div class="result-card">
                        <div class="card-image-container">
                            <img src="${eq.imageUrl || 'https://via.placeholder.com/300x200'}" alt="${eq.name}">
                            <button class="btn-favorite active" onclick="toggleFavorite('${eq.$id}', this)">❤️</button>
                        </div>
                        <h3>${eq.name}</h3>
                        <p>R$ ${eq.price.toFixed(2)}</p>
                        <button class="btn btn-secondary contact-btn" onclick="contactRenter('${eq.renterId}', '${eq.name}')">📞 Contato</button>
                    </div>`;
            } catch(e) {}
        }
    } catch (e) { list.innerHTML = '<p>Erro.</p>'; }
}

// --- MODAL E AUXILIARES ---

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

function closeContactModal() { document.getElementById('contact-modal').style.display = 'none'; }
function copyPhoneNumber() {
    if (!currentContactPhone) return;
    navigator.clipboard.writeText(currentContactPhone).then(() => {
        const btn = document.querySelector('.btn-copy');
        btn.innerHTML = '✅ Copiado!'; btn.style.backgroundColor = '#dcfce7';
        setTimeout(() => { btn.innerHTML = '📋 Copiar Número'; btn.style.backgroundColor = '#e2e8f0'; }, 2000);
    });
}
window.onclick = function(e) {
    if (e.target === document.getElementById('contact-modal')) closeContactModal();
    if (e.target === document.getElementById('review-modal')) closeReviewModal();
}

let debounceTimer; 
function handleAddressInput(event, listId) {
    if (listId.startsWith('reg-')) clearAddressFields(event.target.id.replace('-street', ''));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { searchAddress(event.target.value, listId); }, 300); 
}

async function searchAddress(query, listId) {
    if (query.length < 3) { document.getElementById(listId).classList.remove('show'); return; }
    const list = document.getElementById(listId);
    list.innerHTML = '<div class="loading">...</div>'; list.classList.add('show');
    try {
        const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&lang=pt&limit=5&filter=countrycode:br&apiKey=${apiKey}`);
        const data = await res.json();
        list.innerHTML = '';
        if (data.features?.length) {
            data.features.forEach(f => {
                const div = document.createElement('div'); div.className = 'autocomplete-item';
                div.innerHTML = `<strong>${f.properties.formatted}</strong>`;
                div.onclick = () => { 
                    document.getElementById(listId.replace('List','')).value = f.properties.street || ''; 
                    populateAddressFields(listId.replace('-streetList',''), f); 
                    list.classList.remove('show'); 
                };
                list.appendChild(div);
            });
        } else { list.innerHTML = '<div class="no-results">Nada encontrado</div>'; }
    } catch (e) { list.innerHTML = '<div class="no-results">Erro</div>'; }
}

function clearAddressFields(prefix) {
    document.getElementById(`${prefix}-neighborhood`).value = '';
    document.getElementById(`${prefix}-city`).value = '';
    document.getElementById(`${prefix}-state`).value = '';
    if (prefix.includes('renter')) { document.getElementById(`${prefix}-lat`).value = ''; document.getElementById(`${prefix}-lng`).value = ''; }
}

function populateAddressFields(prefix, location) {
    const p = location.properties;
    document.getElementById(`${prefix}-neighborhood`).value = p.suburb || p.city_district || '';
    document.getElementById(`${prefix}-city`).value = p.city || '';
    document.getElementById(`${prefix}-state`).value = p.state_code || p.state || ''; 
    if (prefix.includes('renter')) {
        document.getElementById(`${prefix}-lat`).value = p.lat || '';
        document.getElementById(`${prefix}-lng`).value = p.lon || '';
    }
}

async function loadStates(selectId) {
    const select = document.getElementById(selectId);
    try {
        const r = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [Query.limit(5000)]);
        const s = [...new Set(r.documents.map(x => x.state))].sort();
        select.innerHTML = '<option value="">Selecione o Estado</option>' + s.map(x => `<option value="${x}">${x}</option>`).join('');
    } catch (e) {}
}

async function loadCities(state, selectId) {
    const select = document.getElementById(selectId);
    try {
        const r = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [Query.equal('state', state), Query.limit(5000)]);
        const c = [...new Set(r.documents.map(x => x.city))].sort();
        select.innerHTML = '<option value="">Selecione a Cidade</option>' + c.map(x => `<option value="${x}">${x}</option>`).join('');
    } catch (e) {}
}