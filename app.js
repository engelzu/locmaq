// ======================================================
// CONFIGURAÇÕES GERAIS
// ======================================================
const apiKey = '435bf07fb6d444f8a0ca1af6906f1bce'; // Geoapify
const STRIPE_LINK_BASICO = 'https://buy.stripe.com/fZu3cv50Ygvw1Mf4g0'; 
const STRIPE_LINK_PREMIUM = 'https://buy.stripe.com/5kQ6oH8da934duX5k4'; 

// Inicialização Appwrite
const { Client, Account, ID, Databases, Storage, Query, Permission, Role } = Appwrite;
const client = new Client()
    .setEndpoint('https://fra.cloud.appwrite.io/v1')
    .setProject('691771230014ab7e6072');

const account = new Account(client);
const databases = new Databases(client);
const storage = new Storage(client);

// IDs
const DB_ID = '6917721d002bc00da375';
const USERS_COLLECTION_ID = 'users';
const RENTERS_COLLECTION_ID = 'locations'; 
const EQUIPMENT_COLLECTION_ID = 'products';
const BUCKET_ID = 'product-images';
const FAVORITES_COLLECTION_ID = 'favorites'; 
const REVIEWS_COLLECTION_ID = 'reviews'; 

// Variáveis de Estado
let currentSession = { isLoggedIn: false, isRenter: false, account: null, profile: null };
let map; 
let markersLayer = L.layerGroup(); 
let currentContactPhone = '';
let currentReviewRenterId = '';
let currentRating = 0;

const planLimits = {
    free: { max: 1, editLock: true },
    basic: { max: 10, editLock: false },
    premium: { max: 20, editLock: false }
};

// ======================================================
// LÓGICA DO IBGE (ESTADOS E CIDADES)
// ======================================================

// 1. Configura os "Ouvintes" para detectar mudança no Select
function setupAddressEvents() {
    // Tela de Cadastro
    const regState = document.getElementById('reg-renter-state');
    if (regState) {
        regState.addEventListener('change', (e) => loadIbgeCities(e.target.value, 'reg-renter-city'));
    }

    // Tela de Edição
    const editState = document.getElementById('edit-renter-state');
    if (editState) {
        editState.addEventListener('change', (e) => loadIbgeCities(e.target.value, 'edit-renter-city'));
    }
}

// 2. Carrega a lista de estados no Select desejado
async function loadIbgeStates(selectId) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    select.innerHTML = '<option value="">Carregando...</option>';

    try {
        const response = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        if (!response.ok) throw new Error('Falha ao conectar no IBGE');
        
        const states = await response.json();

        select.innerHTML = '<option value="">Selecione o Estado</option>';
        states.forEach(state => {
            const option = document.createElement('option');
            // IMPORTANTE: Value = Sigla (MG), Texto = Nome (Minas Gerais)
            option.value = state.sigla; 
            option.textContent = state.nome;
            select.appendChild(option);
        });
    } catch (error) {
        console.error("Erro IBGE:", error);
        select.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// 3. Carrega cidades baseado na UF selecionada
async function loadIbgeCities(uf, citySelectId) {
    const citySelect = document.getElementById(citySelectId);
    
    // Se não tiver UF (ex: o usuário voltou para "Selecione o Estado"), limpa
    if (!uf) {
        citySelect.innerHTML = '<option value="">Selecione um estado acima ⬆️</option>';
        citySelect.disabled = true;
        return;
    }

    citySelect.innerHTML = '<option value="">Carregando cidades...</option>';
    citySelect.disabled = true; // Trava enquanto carrega

    try {
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`);
        if (!response.ok) throw new Error('Falha ao buscar cidades');

        const cities = await response.json();

        citySelect.innerHTML = '<option value="">Selecione a Cidade</option>';
        cities.forEach(city => {
            const option = document.createElement('option');
            option.value = city.nome;
            option.textContent = city.nome;
            citySelect.appendChild(option);
        });
        
        citySelect.disabled = false; // Destrava
    } catch (error) {
        console.error("Erro Cidades:", error);
        citySelect.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================
document.addEventListener('DOMContentLoaded', () => {
    setupAddressEvents(); // Ativa os ouvintes de evento

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('userId') && urlParams.get('secret')) {
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
                await account.deleteSession('current'); 
                showScreen('home-screen');
                return;
            }
        }

        currentSession = { isLoggedIn: true, isRenter: isRenter, account: loggedInAccount, profile: profileDoc };

        if (isRenter) showScreen('renter-dashboard');
        else showScreen('user-location-select');
        
    } catch (error) {
        showScreen('home-screen');
    }
}

// ======================================================
// NAVEGAÇÃO
// ======================================================
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    // Lógicas específicas ao abrir telas
    if (screenId === 'user-location-select') { loadStatesFromDB('user-state-select'); }
    if (screenId === 'user-profile') { loadUserProfile(); }
    if (screenId === 'renter-dashboard') { loadRenterDashboard(); }
    if (screenId === 'renter-profile') { loadRenterProfile(); }
    if (screenId === 'upgrade-plan') { highlightCurrentPlan(); }
    if (screenId === 'user-favorites') { loadFavoritesScreen(); }
    
    // CARREGA ESTADOS DO IBGE SE FOR CADASTRO
    if (screenId === 'renter-register') { 
        loadIbgeStates('reg-renter-state'); 
    } 

    const element = document.getElementById(screenId);
    if (element) element.classList.add('active');

    if (screenId === 'user-dashboard' && map) setTimeout(() => map.invalidateSize(), 100);
}

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('global-alert');
    alertBox.textContent = message;
    alertBox.className = `alert-${type}`;
    alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 6000);
}

// ======================================================
// CADASTRO E LOGIN
// ======================================================
async function userRegister(event) {
    event.preventDefault();
    const name = document.getElementById('reg-user-name').value;
    const phone = document.getElementById('reg-user-phone').value;
    const email = document.getElementById('reg-user-email').value;
    const password = document.getElementById('reg-user-password').value;
    const confirm = document.getElementById('reg-user-confirm-password').value;

    if (password !== confirm) return showAlert('As senhas não conferem.');

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        await databases.createDocument(DB_ID, USERS_COLLECTION_ID, authUser.$id, { name, phone, email, userId: authUser.$id });
        await account.createEmailSession(email, password);
        showAlert('Usuário cadastrado!', 'success');
        initializeApp();
    } catch (error) { showAlert(`Erro: ${error.message}`); }
}

async function renterRegister(event) {
    event.preventDefault();
    const btn = document.getElementById('btn-reg-renter');
    btn.disabled = true; btn.innerText = "Cadastrando...";

    const name = document.getElementById('reg-renter-name').value;
    const phone = document.getElementById('reg-renter-phone').value;
    const street = document.getElementById('reg-renter-street').value;
    const number = document.getElementById('reg-renter-number').value;
    const neighborhood = document.getElementById('reg-renter-neighborhood').value;
    
    // PEGA DO SELECT CORRETAMENTE
    const city = document.getElementById('reg-renter-city').value;
    const state = document.getElementById('reg-renter-state').value;
    
    const email = document.getElementById('reg-renter-email').value;
    const password = document.getElementById('reg-renter-password').value;
    const confirm = document.getElementById('reg-renter-confirm-password').value;

    if (password !== confirm) {
        btn.disabled = false; btn.innerText = "Cadastrar";
        return showAlert('As senhas não conferem.');
    }

    if (!city || !state) {
        btn.disabled = false; btn.innerText = "Cadastrar";
        return showAlert('Selecione Estado e Cidade corretamente.');
    }

    // Geocodificação (Tenta pegar coordenadas)
    let lat = 0, lng = 0;
    try {
        const fullAddress = `${street}, ${number}, ${neighborhood}, ${city}, ${state}, Brazil`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fullAddress)}`);
        const data = await res.json();
        if (data && data.length > 0) { lat = parseFloat(data[0].lat); lng = parseFloat(data[0].lon); }
    } catch (e) { console.log('Erro geo, salvando sem mapa.'); }

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        const fullStreet = `${street}, ${number}`;
        
        await databases.createDocument(DB_ID, RENTERS_COLLECTION_ID, authUser.$id, {
            name, phone, street: fullStreet, neighborhood, city, state, lat, lng, email, plan: 'free', renterId: authUser.$id
        });
        await account.createEmailSession(email, password);
        showAlert('Locador cadastrado!', 'success');
        initializeApp();
    } catch (error) { 
        showAlert(`Erro: ${error.message}`); 
    } finally {
        btn.disabled = false; btn.innerText = "Cadastrar";
    }
}

async function userLogin(e) { e.preventDefault(); login(document.getElementById('user-email').value, document.getElementById('user-password').value, USERS_COLLECTION_ID); }
async function renterLogin(e) { e.preventDefault(); login(document.getElementById('renter-email').value, document.getElementById('renter-password').value, RENTERS_COLLECTION_ID); }

async function login(email, password, collectionId) {
    try {
        await account.createEmailSession(email, password);
        const acc = await account.get();
        await databases.getDocument(DB_ID, collectionId, acc.$id); // Verifica se existe na coleção correta
        showAlert('Login sucesso!', 'success');
        initializeApp();
    } catch (error) { 
        showAlert('Erro no login. Verifique dados.'); 
        await account.deleteSession('current').catch(()=>{}); 
    }
}

async function recoverPassword(e, type) {
    e.preventDefault();
    const id = type === 'user' ? 'recover-user-email' : 'recover-renter-email';
    const email = document.getElementById(id).value;
    try {
        await account.createRecovery(email, window.location.href);
        showAlert('Email enviado!', 'success');
        showScreen(type === 'user' ? 'user-login' : 'renter-login');
    } catch (e) { showAlert('Erro ao enviar email.'); }
}

async function finishPasswordReset(e) {
    e.preventDefault();
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('confirm-new-password').value;
    if(p1 !== p2) return showAlert('Senhas não batem.');
    const url = new URLSearchParams(window.location.search);
    try {
        await account.updateRecovery(url.get('userId'), url.get('secret'), p1, p1);
        showAlert('Senha alterada!', 'success');
        showScreen('home-screen');
    } catch(e) { showAlert('Erro ao alterar senha.'); }
}

async function logout() {
    await account.deleteSession('current').catch(()=>{});
    currentSession = {};
    showScreen('home-screen');
}

// ======================================================
// PERFIS
// ======================================================
function loadUserProfile() {
    const u = currentSession.profile;
    if(!u) return;
    document.getElementById('edit-user-name').value = u.name;
    document.getElementById('edit-user-phone').value = u.phone;
    document.getElementById('edit-user-email').value = u.email;
}
async function updateUserProfile(e) {
    e.preventDefault();
    try {
        await databases.updateDocument(DB_ID, USERS_COLLECTION_ID, currentSession.profile.$id, {
            name: document.getElementById('edit-user-name').value,
            phone: document.getElementById('edit-user-phone').value
        });
        currentSession.profile = await databases.getDocument(DB_ID, USERS_COLLECTION_ID, currentSession.profile.$id);
        showAlert('Atualizado!', 'success');
    } catch(e) { showAlert('Erro ao atualizar.'); }
}

async function loadRenterProfile() {
    const r = currentSession.profile;
    if(!r) return;
    
    document.getElementById('edit-renter-name').value = r.name;
    document.getElementById('edit-renter-phone').value = r.phone;
    
    // Separa Rua e Número
    if (r.street && r.street.includes(',')) {
        const parts = r.street.split(',');
        const num = parts.pop().trim();
        document.getElementById('edit-renter-street').value = parts.join(',').trim();
        document.getElementById('edit-renter-number').value = num;
    } else {
        document.getElementById('edit-renter-street').value = r.street || '';
    }

    document.getElementById('edit-renter-neighborhood').value = r.neighborhood;
    document.getElementById('edit-renter-email').value = r.email;

    // 1. Carrega Estados do IBGE no select de edição
    await loadIbgeStates('edit-renter-state');
    
    // 2. Seleciona o Estado do usuário (Sigla)
    const elState = document.getElementById('edit-renter-state');
    if(r.state) {
        elState.value = r.state; 
        
        // 3. Carrega Cidades desse estado
        await loadIbgeCities(r.state, 'edit-renter-city');
        
        // 4. Seleciona a Cidade do usuário
        document.getElementById('edit-renter-city').value = r.city;
    }
}

async function updateRenterProfile(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-edit-renter');
    btn.innerText = "Salvando..."; btn.disabled = true;

    const street = document.getElementById('edit-renter-street').value;
    const number = document.getElementById('edit-renter-number').value;
    const neighborhood = document.getElementById('edit-renter-neighborhood').value;
    const city = document.getElementById('edit-renter-city').value;
    const state = document.getElementById('edit-renter-state').value;
    
    // Geo update
    let lat = currentSession.profile.lat, lng = currentSession.profile.lng;
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(`${street}, ${number}, ${neighborhood}, ${city}, ${state}`)}`);
        const d = await res.json();
        if(d && d.length) { lat = parseFloat(d[0].lat); lng = parseFloat(d[0].lon); }
    } catch(err){}

    try {
        await databases.updateDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.profile.$id, {
            name: document.getElementById('edit-renter-name').value,
            phone: document.getElementById('edit-renter-phone').value,
            street: `${street}, ${number}`,
            neighborhood, city, state, lat, lng
        });
        currentSession.profile = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.profile.$id);
        showAlert('Perfil atualizado!', 'success');
        showScreen('renter-dashboard');
    } catch(err) { showAlert('Erro ao atualizar.'); }
    finally { btn.innerText = "Atualizar Dados"; btn.disabled = false; }
}


// ======================================================
// FUNCIONALIDADES (MAPA, FAVORITOS, ETC)
// ======================================================
async function loadRenterDashboard() {
    if(!currentSession.isLoggedIn) return;
    try {
        const list = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', currentSession.profile.$id)]);
        const limit = planLimits[currentSession.profile.plan].max;
        document.getElementById('plan-info').innerHTML = `<h3>Plano ${currentSession.profile.plan}</h3><p>${list.total} / ${limit} itens</p>`;
        
        const div = document.getElementById('equipment-list');
        div.innerHTML = '';
        list.documents.forEach(eq => {
            const isAv = eq.isAvailable !== false;
            div.innerHTML += `
                <div class="equipment-card">
                    <img src="${eq.imageUrl || 'https://via.placeholder.com/120'}" style="width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px;">
                    <div class="equipment-info">
                        <span class="status-badge ${isAv?'status-available':'status-rented'}">${isAv?'LIVRE':'ALUGADO'}</span>
                        <h4>${eq.name}</h4>
                        <div class="equipment-actions">
                            <button class="toggle-btn" onclick="toggleStatus('${eq.$id}', ${isAv})">Mudar Status</button>
                            <button class="delete-btn" onclick="deleteEq('${eq.$id}')">X</button>
                        </div>
                    </div>
                </div>`;
        });
    } catch(e){}
}

async function toggleStatus(id, status) {
    await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, { isAvailable: !status });
    loadRenterDashboard();
}

async function deleteEq(id) {
    if(confirm('Deletar?')) {
        await databases.deleteDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id);
        loadRenterDashboard();
    }
}

async function saveEquipment(e) {
    e.preventDefault();
    const file = document.getElementById('equipment-image').files[0];
    let url = null;
    if(file) {
        const up = await storage.createFile(BUCKET_ID, ID.unique(), file, [Permission.read(Role.any())]);
        url = storage.getFileView(BUCKET_ID, up.$id).href;
    }
    
    await databases.createDocument(DB_ID, EQUIPMENT_COLLECTION_ID, ID.unique(), {
        renterId: currentSession.profile.$id,
        renterName: currentSession.profile.name,
        city: currentSession.profile.city,
        state: currentSession.profile.state,
        lat: currentSession.profile.lat,
        lng: currentSession.profile.lng,
        name: document.getElementById('equipment-name').value,
        description: document.getElementById('equipment-description').value,
        price: parseFloat(document.getElementById('equipment-price').value),
        voltage: document.getElementById('equipment-voltage').value,
        imageUrl: url,
        isAvailable: true
    });
    showAlert('Salvo!', 'success'); showScreen('renter-dashboard');
}

function previewImage(e) {
    const reader = new FileReader();
    reader.onload = (ev) => document.getElementById('image-preview').innerHTML = `<img src="${ev.target.result}" style="width:100%">`;
    reader.readAsDataURL(e.target.files[0]);
}

// MAPA E BUSCA
function initMap() {
    if(map) return;
    map = L.map('map').setView([-14.23, -51.92], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    markersLayer.addTo(map);
}

async function searchRenters(e) {
    e.preventDefault();
    showScreen('user-dashboard');
    setTimeout(() => {
        initMap();
        populateEqDropdown();
    }, 100);
}

// FUNÇÕES DE BUSCA (PARA O USUÁRIO) - USA O BANCO DE DADOS, NÃO O IBGE
async function loadStatesFromDB(id) {
    const s = document.getElementById(id); s.innerHTML = '<option>Carregando...</option>';
    const res = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [Query.limit(1000)]);
    const states = [...new Set(res.documents.map(x=>x.state))];
    s.innerHTML = '<option value="">Selecione</option>';
    states.forEach(st => s.innerHTML += `<option value="${st}">${st}</option>`);
}

async function loadCitiesFromDB(state, id) {
    const s = document.getElementById(id); s.innerHTML = '<option>Carregando...</option>';
    const res = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [Query.equal('state', state)]);
    const cities = [...new Set(res.documents.map(x=>x.city))];
    s.innerHTML = '<option value="">Selecione</option>';
    cities.forEach(c => s.innerHTML += `<option value="${c}">${c}</option>`);
}

async function populateEqDropdown() {
    const st = document.getElementById('user-state-select').value;
    const ci = document.getElementById('user-city-select').value;
    const sel = document.getElementById('equipment-select');
    const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('state', st), Query.equal('city', ci)]);
    const names = [...new Set(res.documents.map(x=>x.name))];
    sel.innerHTML = '<option value="">Todos</option>';
    names.forEach(n => sel.innerHTML += `<option value="${n}">${n}</option>`);
}

async function searchEquipment() {
    const st = document.getElementById('user-state-select').value;
    const ci = document.getElementById('user-city-select').value;
    const term = document.getElementById('equipment-select').value;
    const q = [Query.equal('state', st), Query.equal('city', ci)];
    if(term) q.push(Query.equal('name', term));
    
    const res = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, q);
    const div = document.getElementById('equipment-results');
    div.innerHTML = ''; markersLayer.clearLayers();
    
    if(res.documents.length === 0) div.innerHTML = '<p>Nada encontrado.</p>';
    
    res.documents.forEach(eq => {
        div.innerHTML += `
            <div class="result-card">
                <img src="${eq.imageUrl || ''}" style="width:100%; aspect-ratio:1; object-fit:cover">
                <h3>${eq.name}</h3>
                <p>R$ ${eq.price}/dia</p>
                <button class="btn btn-primary" onclick="contact('${eq.renterId}')">Contato</button>
            </div>
        `;
        if(eq.lat) L.marker([eq.lat, eq.lng]).addTo(markersLayer).bindPopup(eq.name);
    });
}

async function contact(id) {
    const r = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, id);
    alert(`Ligue para: ${r.phone}`);
}

async function logout() {
    await account.deleteSession('current').catch(()=>{});
    currentSession = {};
    showScreen('home-screen');
}

// Stripe e Planos
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
    if (currentPlanBtn) { currentPlanBtn.textContent = 'Plano Atual'; currentPlanBtn.disabled = true; }
}