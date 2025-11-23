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

// Variáveis de sessão globais
let currentSession = {
    isLoggedIn: false,
    isRenter: false,
    account: null, 
    profile: null 
};
// ======================================================

// LIMITES DOS PLANOS
const planLimits = {
    free: { max: 1, editLock: true },
    basic: { max: 10, editLock: false },
    premium: { max: 20, editLock: false }
};

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // !! VERIFICAÇÃO DE RECUPERAÇÃO DE SENHA !!
    // Detecta se o usuário chegou clicando no link do e-mail
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const secret = urlParams.get('secret');

    if (userId && secret) {
        console.log("Detectado fluxo de recuperação de senha.");
        showScreen('reset-password-screen');
    } else {
        // Fluxo normal
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
    
    if (screenId === 'user-location-select') {
        loadStates('user-state-select'); 
    }
    if (screenId === 'user-profile') {
        loadUserProfile();
    }
    if (screenId === 'renter-dashboard') {
        loadRenterDashboard();
    }
    if (screenId === 'renter-profile') {
        loadRenterProfile();
    }
     if (screenId === 'upgrade-plan') {
        highlightCurrentPlan();
    }
    
    const element = document.getElementById(screenId);
    if (element) {
        element.classList.add('active');
    } else {
        console.error(`Erro: Tela com ID '${screenId}' não encontrada.`);
    }

    if (screenId === 'user-dashboard' && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 100); 
    }
}

function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('global-alert');
    alertBox.textContent = message;
    alertBox.className = `alert-${type}`;
    alertBox.style.display = 'block';

    setTimeout(() => {
        alertBox.style.display = 'none';
    }, 6000);
}


// --- AUTENTICAÇÃO E SESSÃO ---

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

    if (password !== confirmPassword) {
        return showAlert('As senhas não conferem.');
    }
    if (!street || !city || !state) {
        return showAlert('Por favor, selecione um endereço válido da lista.');
    }

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        
        const userData = {
            name, phone, street, neighborhood, city, state, email,
            userId: authUser.$id 
        };
        await databases.createDocument(DB_ID, USERS_COLLECTION_ID, authUser.$id, userData);
        
        await account.createEmailSession(email, password);
        
        showAlert('Usuário cadastrado com sucesso!', 'success');
        initializeApp();

    } catch (error) {
        console.error("Erro no cadastro de usuário:", error);
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
    
    if (password !== confirmPassword) {
        return showAlert('As senhas não conferem.');
    }
     if (!street || !city || !state || !lat || !lng) {
        return showAlert('Por favor, selecione um endereço válido da lista.');
    }

    try {
        const authUser = await account.create(ID.unique(), email, password, name);
        
        const renterData = {
            name, phone, street, neighborhood, city, state, lat, lng, email,
            plan: 'free',
            renterId: authUser.$id
        };
        await databases.createDocument(DB_ID, RENTERS_COLLECTION_ID, authUser.$id, renterData);
        
        await account.createEmailSession(email, password);

        showAlert('Locador cadastrado com sucesso!', 'success');
        initializeApp();

    } catch (error) {
        console.error("Erro no cadastro de locador:", error);
        showAlert(`Erro no cadastro: ${error.message}`);
        
        const user = await account.get().catch(() => null);
        if (user && user.email === email) {
            await account.deleteSession('current');
            await account.delete(user.$id);
            console.log("Usuário 'fantasma' do Auth foi limpo.");
            showAlert("Ocorreu um erro no DB, mas o usuário 'fantasma' do Auth foi limpo. Tente novamente.");
        }
    }
}

async function userLogin(event) {
    event.preventDefault();
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;

    try {
        await account.createEmailSession(email, password);
        const loggedInAccount = await account.get();
        await databases.getDocument(DB_ID, USERS_COLLECTION_ID, loggedInAccount.$id);
        
        showAlert('Login efetuado com sucesso!', 'success');
        initializeApp();

    } catch (error) {
        console.error("Erro no login de usuário:", error);
        showAlert('E-mail ou senha inválidos, ou esta não é uma conta de usuário.');
        await account.deleteSession('current').catch(() => {}); 
    }
}

async function renterLogin(event) {
    event.preventDefault();
    const email = document.getElementById('renter-email').value;
    const password = document.getElementById('renter-password').value;

     try {
        await account.createEmailSession(email, password);
        const loggedInAccount = await account.get();
        await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, loggedInAccount.$id);
        
        showAlert('Login efetuado com sucesso!', 'success');
        initializeApp();

    } catch (error) {
        console.error("Erro no login de locador:", error);
        showAlert('E-mail ou senha inválidos, ou esta não é uma conta de locador.');
        await account.deleteSession('current').catch(() => {}); 
    }
}

// --- FUNÇÕES DE RECUPERAÇÃO DE SENHA ---

// 1. Envia o e-mail (COM TRIM CORRIGIDO)
async function recoverPassword(event, type) {
    event.preventDefault();
    
    const inputId = (type === 'user') ? 'recover-user-email' : 'recover-renter-email';
    const rawEmail = document.getElementById(inputId).value;
    
    // REMOVE ESPAÇOS INVISÍVEIS
    const email = rawEmail.trim(); 

    console.log(`Tentando recuperar para o e-mail: '${email}'`);

    if (!email) {
        return showAlert('Por favor, digite um e-mail válido.');
    }

    try {
        const urlObj = new URL(window.location.href);
        // Garante uma URL limpa para o redirecionamento
        const resetUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`; 
        
        await account.createRecovery(email, resetUrl);
        
        showAlert('Sucesso! Verifique seu e-mail (Caixa de Entrada e SPAM).', 'success');
        
        const targetLogin = (type === 'user') ? 'user-login' : 'renter-login';
        showScreen(targetLogin);
        
    } catch (error) {
         console.error("ERRO AO RECUPERAR:", error);
         if (error.code === 404) {
             alert(`Erro: O e-mail '${email}' não foi encontrado no cadastro de autenticação.`);
         } else {
             alert(`Erro ao enviar: ${error.message}`);
         }
    }
}

// 2. Define a nova senha
async function finishPasswordReset(event) {
    event.preventDefault();
    
    const password = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-new-password').value;
    
    if (password !== confirmPassword) {
        return showAlert('As senhas não conferem.');
    }

    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('userId');
    const secret = urlParams.get('secret');

    if (!userId || !secret) {
        return showAlert('Link inválido ou expirado.');
    }

    try {
        await account.updateRecovery(userId, secret, password, password);
        
        showAlert('Senha alterada com sucesso! Faça login agora.', 'success');
        
        window.history.replaceState({}, document.title, window.location.pathname);
        showScreen('home-screen');
        
    } catch (error) {
        console.error("Erro ao finalizar recuperação:", error);
        alert(`Erro ao salvar nova senha: ${error.message}`);
    }
}

async function logout() {
    try {
        await account.deleteSession('current');
        currentSession = { isLoggedIn: false, isRenter: false, account: null, profile: null };
        showAlert('Você foi desconectado.', 'success');
        showScreen('home-screen');
    } catch (error) {
        console.error("Erro ao sair:", error);
        showAlert(`Erro ao sair: ${error.message}`);
    }
}


// --- PERFIS (USUÁRIO E LOCADOR) ---

function loadUserProfile() {
    if (!currentSession.isLoggedIn || currentSession.isRenter) return; 
    const user = currentSession.profile;

    document.getElementById('edit-user-name').value = user.name;
    document.getElementById('edit-user-phone').value = user.phone || '';
    document.getElementById('edit-user-street').value = user.street || '';
    document.getElementById('edit-user-neighborhood').value = user.neighborhood || '';
    document.getElementById('edit-user-city').value = user.city || '';
    document.getElementById('edit-user-state').value = user.state || '';
    document.getElementById('edit-user-email').value = user.email;
}

async function updateUserProfile(event) {
    event.preventDefault();
    if (!currentSession.isLoggedIn || currentSession.isRenter) return;

    const street = document.getElementById('edit-user-street').value;
    const city = document.getElementById('edit-user-city').value;
    const state = document.getElementById('edit-user-state').value;

    if (street && (!city || !state)) {
         if (street !== currentSession.profile.street) {
             return showAlert('Endereço incompleto. Por favor, selecione um endereço da lista de sugestões.');
         }
    }
    
    const updatedData = {
        name: document.getElementById('edit-user-name').value,
        phone: document.getElementById('edit-user-phone').value,
        street: street,
        neighborhood: document.getElementById('edit-user-neighborhood').value,
        city: city,
        state: state
    };

    try {
        const docId = currentSession.profile.$id;
        const updatedDoc = await databases.updateDocument(DB_ID, USERS_COLLECTION_ID, docId, updatedData);
        
        currentSession.profile = updatedDoc; 
        showAlert('Perfil atualizado com sucesso!', 'success');
        showScreen('user-dashboard');
    } catch (error) {
         console.error("Erro ao atualizar perfil de usuário:", error);
         showAlert(`Erro ao atualizar: ${error.message}`);
    }
}

function loadRenterProfile() {
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    const renter = currentSession.profile;

    document.getElementById('edit-renter-name').value = renter.name;
    document.getElementById('edit-renter-phone').value = renter.phone || '';
    document.getElementById('edit-renter-street').value = renter.street || '';
    document.getElementById('edit-renter-neighborhood').value = renter.neighborhood || '';
    document.getElementById('edit-renter-city').value = renter.city || '';
    document.getElementById('edit-renter-state').value = renter.state || '';
    document.getElementById('edit-renter-email').value = renter.email;
}

async function updateRenterProfile(event) {
    event.preventDefault();
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;

    const street = document.getElementById('edit-renter-street').value;
    const city = document.getElementById('edit-renter-city').value;
    const state = document.getElementById('edit-renter-state').value;
    const lat = parseFloat(document.getElementById('reg-renter-lat').value);
    const lng = parseFloat(document.getElementById('reg-renter-lng').value);

    if (street && (!city || !state)) {
         if (street !== currentSession.profile.street) {
            return showAlert('Endereço incompleto. Por favor, selecione um endereço da lista de sugestões.');
         }
    }

    const updatedData = {
        name: document.getElementById('edit-renter-name').value,
        phone: document.getElementById('edit-renter-phone').value,
        street: street,
        neighborhood: document.getElementById('edit-renter-neighborhood').value,
        city: city,
        state: state,
    };
    
    if (lat && lng) {
        updatedData.lat = lat;
        updatedData.lng = lng;
    }

    try {
        const docId = currentSession.profile.$id;
        const updatedDoc = await databases.updateDocument(DB_ID, RENTERS_COLLECTION_ID, docId, updatedData);
        
        currentSession.profile = updatedDoc; 
        showAlert('Perfil atualizado com sucesso!', 'success');
        showScreen('renter-dashboard');
    } catch (error) {
         console.error("Erro ao atualizar perfil de locador:", error);
         showAlert(`Erro ao atualizar: ${error.message}`);
    }
}


// --- DASHBOARD LOCADOR (EQUIPAMENTOS E PLANOS) ---

async function loadRenterDashboard() {
    if (!currentSession.isLoggedIn || !currentSession.isRenter) return;
    
    try {
        currentSession.profile = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, currentSession.account.$id);
    } catch (e) {
        console.error("Erro ao recarregar perfil do locador:", e);
        logout(); 
    }
    
    loadPlanInfo();
    loadEquipmentList();
}

async function loadPlanInfo() {
    const renter = currentSession.profile;
    
    try {
        const equipmentList = await databases.listDocuments(
            DB_ID, 
            EQUIPMENT_COLLECTION_ID,
            [ Query.equal('renterId', renter.$id) ]
        );
        const myEquipmentCount = equipmentList.total;

        const plan = renter.plan;
        const limit = planLimits[plan].max;
        
        document.getElementById('plan-info').innerHTML = `
            <h3>Plano ${plan.charAt(0).toUpperCase() + plan.slice(1)}</h3>
            <p>Equipamentos: ${myEquipmentCount} / ${limit}</p>
            <span class="badge badge-${plan}">${plan}</span>
        `;
    } catch (error) {
        console.error("Erro ao carregar informações do plano:", error);
    }
}

async function loadEquipmentList() {
    const renterId = currentSession.profile.$id;
    const listContainer = document.getElementById('equipment-list');
    listContainer.innerHTML = ''; 

    try {
        const response = await databases.listDocuments(
            DB_ID,
            EQUIPMENT_COLLECTION_ID,
            [ Query.equal('renterId', renterId) ]
        );
        
        const myEquipment = response.documents;

        if (myEquipment.length === 0) {
            listContainer.innerHTML = `<div class="empty-state"><p>Nenhum equipamento cadastrado.</p></div>`;
            return;
        }

        myEquipment.forEach(eq => {
            const imageUrl = eq.imageUrl || 'https://via.placeholder.com/120';
            
            listContainer.innerHTML += `
                <div class="equipment-card">
                    <img src="${imageUrl}" alt="${eq.name}">
                    <div class="equipment-info">
                        <h4>${eq.name}</h4>
                        <p>R$ ${eq.price} / dia - ${eq.voltage}</p>
                        <p class="description">${eq.description}</p>
                        <div class="equipment-actions">
                            <button class="edit-btn" onclick="editEquipment('${eq.$id}')">Editar</button>
                            <button class="delete-btn" onclick="deleteEquipment('${eq.$id}')">Excluir</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Erro ao carregar lista de equipamentos:", error);
        listContainer.innerHTML = `<div class="empty-state"><p>Erro ao carregar equipamentos.</p></div>`;
    }
}

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
    const name = document.getElementById('equipment-name').value;
    const description = document.getElementById('equipment-description').value;
    const price = parseFloat(document.getElementById('equipment-price').value);
    const voltage = document.getElementById('equipment-voltage').value;
    const imageFile = document.getElementById('equipment-image').files[0];
    
    let imageUrl = null;

    try {
        if (imageFile) {
            const filePermissions = [
                Permission.read(Role.any())
            ];
            
            const uploadedFile = await storage.createFile(
                BUCKET_ID, 
                ID.unique(), 
                imageFile,
                filePermissions 
            );
            
            const result = storage.getFileView(BUCKET_ID, uploadedFile.$id);
            imageUrl = result.href; 
        }

        const equipmentData = {
            renterId: renter.$id,
            renterName: renter.name,
            city: renter.city,
            state: renter.state,
            lat: renter.lat,
            lng: renter.lng,
            name, description, price, voltage
        };
        
        if (imageUrl) {
            equipmentData.imageUrl = imageUrl;
        }

        if (id) {
            if (!imageUrl) {
                delete equipmentData.imageUrl; 
            }
            await databases.updateDocument(DB_ID, EQUIPMENT_COLLECTION_ID, id, equipmentData);
            showAlert('Equipamento atualizado!', 'success');
        } else {
            const response = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, [Query.equal('renterId', renter.$id)]);
            const myEquipmentCount = response.total;
            const limit = planLimits[renter.plan].max;

            if (myEquipmentCount >= limit) {
                showAlert(`Limite do plano atingido (${limit}). Faça um upgrade!`, 'warning');
                return showScreen('upgrade-plan');
            }
            
            await databases.createDocument(DB_ID, EQUIPMENT_COLLECTION_ID, ID.unique(), equipmentData);
            showAlert('Equipamento salvo!', 'success');
        }
        
        showScreen('renter-dashboard');

    } catch (error) {
        console.error("Erro ao salvar equipamento:", error);
        showAlert(`Erro ao salvar: ${error.message}`);
    }
}

async function editEquipment(docId) {
    try {
        const eq = await databases.getDocument(DB_ID, EQUIPMENT_COLLECTION_ID, docId);

        document.getElementById('equipment-form-title').textContent = 'Editar Equipamento';
        document.getElementById('equipment-id').value = eq.$id; 
        document.getElementById('equipment-name').value = eq.name;
        document.getElementById('equipment-description').value = eq.description;
        document.getElementById('equipment-price').value = eq.price;
        document.getElementById('equipment-voltage').value = eq.voltage;
        
        const preview = document.getElementById('image-preview');
        preview.innerHTML = '';
        if (eq.imageUrl) {
            preview.innerHTML = `<img src="${eq.imageUrl}" alt="Prévia">`;
        }
        
        showScreen('add-equipment'); 

    } catch (error) {
        console.error("Erro ao buscar equipamento para editar:", error);
        showAlert(`Erro: ${error.message}`);
    }
}

async function deleteEquipment(docId) {
    if (confirm('Tem certeza que deseja excluir este equipamento?')) {
        try {
            try {
                const eq = await databases.getDocument(DB_ID, EQUIPMENT_COLLECTION_ID, docId);
                if (eq.imageUrl) {
                    const url = new URL(eq.imageUrl);
                    const fileId = url.pathname.split('/files/')[1].split('/')[0];
                    await storage.deleteFile(BUCKET_ID, fileId);
                    console.log("Imagem do storage excluída:", fileId);
                }
            } catch (storageError) {
                console.warn("Não foi possível excluir a imagem do storage (ou ela não existia):", storageError);
            }
            
            await databases.deleteDocument(DB_ID, EQUIPMENT_COLLECTION_ID, docId);
            
            showAlert('Equipamento excluído.', 'success');
            loadEquipmentList(); 
        } catch (error) {
             console.error("Erro ao excluir equipamento:", error);
             showAlert(`Erro: ${error.message}`);
        }
    }
}

function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('image-preview');
            preview.innerHTML = `<img src="${e.target.result}" alt="Prévia da Imagem">`;
        }
        reader.readAsDataURL(file);
    }
}

// ======================================================
// FUNÇÃO selectPlan
// ======================================================
async function selectPlan(planName) {
    if (planName === 'free') {
        showAlert('Você já está no plano Grátis.', 'warning');
        return;
    }

    if (!currentSession.isLoggedIn || !currentSession.isRenter) {
        return showAlert("Você precisa estar logado como locador para assinar um plano.");
    }

    const renterId = currentSession.profile.$id; 
    const renterEmail = currentSession.profile.email;

    let stripeUrl = "";
    if (planName === 'basic') {
        stripeUrl = STRIPE_LINK_BASICO;
    } else if (planName === 'premium') {
        stripeUrl = STRIPE_LINK_PREMIUM;
    }

    if (!stripeUrl || !stripeUrl.startsWith('https://')) {
        showAlert('Links de pagamento do Stripe não configurados no app.js!', 'error');
        return;
    }

    try {
        const url = new URL(stripeUrl);
        url.searchParams.append('prefilled_email', renterEmail);
        url.searchParams.append('client_reference_id', renterId); 
        
        showAlert('Redirecionando para o pagamento...', 'success');
        window.location.href = url.toString();

    } catch (error) {
        console.error("Erro ao redirecionar para o Stripe:", error);
        showAlert("Erro ao processar o link de pagamento.");
    }
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


// --- DASHBOARD USUÁRIO (BUSCA) ---

let map; 
let markersLayer = L.layerGroup(); 

function initializeMap() {
    if (!map) { 
        map = L.map('map').setView([-15.78, -47.92], 4); 
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
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
        const response = await databases.listDocuments(
            DB_ID,
            EQUIPMENT_COLLECTION_ID,
            [
                Query.equal('state', state),
                Query.equal('city', city)
            ]
        );
        
        const locationEquipment = response.documents;
        const equipmentNames = [...new Set(locationEquipment.map(eq => eq.name))];
        
        equipmentNames.sort((a, b) => a.localeCompare(b));

        select.innerHTML = '<option value="">-- Todos os Equipamentos --</option>';
        
        if (equipmentNames.length === 0) {
             select.innerHTML = '<option value="">-- Nenhum equipamento nesta cidade --</option>';
        } else {
            equipmentNames.forEach(name => {
                select.innerHTML += `<option value="${name}">${name}</option>`;
            });
        }
    } catch (error) {
        console.error("Erro ao popular dropdown de equipamentos:", error);
        select.innerHTML = '<option value="">-- Erro ao carregar --</option>';
    }
}

async function searchEquipment() {
    const state = document.getElementById('user-state-select').value;
    const city = document.getElementById('user-city-select').value;
    const searchTerm = document.getElementById('equipment-select').value.toLowerCase();
    
    const resultsContainer = document.getElementById('equipment-results');
    resultsContainer.innerHTML = '<div class="spinner"></div>'; 
    markersLayer.clearLayers(); 

    const queries = [
        Query.equal('state', state),
        Query.equal('city', city)
    ];
    
    if (searchTerm) { 
        queries.push(Query.equal('name', searchTerm));
    }
    
    try {
        const response = await databases.listDocuments(DB_ID, EQUIPMENT_COLLECTION_ID, queries);
        const results = response.documents;

        if (results.length === 0) {
            const searchName = searchTerm || "qualquer equipamento";
            resultsContainer.innerHTML = `<div class="empty-state"><p>Nenhum resultado para "${searchName}" em ${city}/${state}.</p></div>`;
            map.setView([-15.78, -47.92], 4); 
            return;
        }

        resultsContainer.innerHTML = ''; 
        const bounds = []; 

        results.forEach(eq => {
            const imageUrl = eq.imageUrl || 'https://via.placeholder.com/300x200';
            
            resultsContainer.innerHTML += `
                <div class="result-card">
                    <img src="${imageUrl}" alt="${eq.name}">
                    <h3>${eq.name}</h3>
                    <p><strong>${eq.renterName}</strong> - ${eq.city}/${eq.state}</p>
                    <p>${eq.description}</p>
                    <p>Tensão: ${eq.voltage}</p>
                    <p class="price">R$ ${eq.price} / dia</p>
                    <button class="btn btn-secondary contact-btn" onclick="contactRenter('${eq.renterId}')">
                        <span class="icon">📞</span> Contato
                    </button>
                </div>
            `;
            
            if (eq.lat && eq.lng && eq.lat !== 0 && eq.lng !== 0) {
                const latLng = [eq.lat, eq.lng];
                const marker = L.marker(latLng).addTo(markersLayer);
                marker.bindPopup(`<b>${eq.name}</b><br>${eq.renterName}<br>R$ ${eq.price}/dia`);
                bounds.push(latLng);
            } else {
                console.warn(`Equipamento '${eq.name}' (ID: ${eq.$id}) está sem coordenadas. Não será exibido no mapa.`);
            }
        });
        
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        } else {
            map.setView([-15.78, -47.92], 4);
        }
        
    } catch (error) {
        console.error("Erro ao pesquisar equipamentos:", error);
        resultsContainer.innerHTML = `<div class="empty-state"><p>Erro ao realizar a busca.</p></div>`;
    }
}

async function contactRenter(renterId) {
    try {
        const renter = await databases.getDocument(DB_ID, RENTERS_COLLECTION_ID, renterId);
        showAlert(`Contatando ${renter.name}... Telefone: ${renter.phone}`, 'success');
    } catch (error) {
        console.error("Erro ao buscar dados do locador:", error);
        showAlert('Erro ao buscar dados do locador.');
    }
}


// --- GEOAPIFY E LOCALIZAÇÃO ---

let debounceTimer; 

function handleAddressInput(event, listId) {
    if (listId.startsWith('reg-')) {
        const prefix = event.target.id.replace('-street', '');
        clearAddressFields(prefix);
    }
    
    clearTimeout(debounceTimer);
    const query = event.target.value;
    debounceTimer = setTimeout(() => {
        searchAddress(query, listId);
    }, 300); 
}

async function searchAddress(query, listId) {
    if (query.length < 3) {
        hideList(listId);
        return;
    }

    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = '<div class="loading">Buscando...</div>';
    list.classList.add('show');

    try {
        const response = await fetch(
            `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&lang=pt&limit=5&filter=countrycode:br&apiKey=${apiKey}`
        );
        
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
            displayResults(data.features, listId);
        } else {
            list.innerHTML = '<div class="no-results">Nenhum resultado encontrado</div>';
        }
    } catch (error) {
        console.error('Erro ao buscar endereços:', error);
        list.innerHTML = '<div class="no-results">Erro ao buscar endereços</div>';
    }
}

function displayResults(features, listId) {
    const list = document.getElementById(listId);
    if (!list) return;
    list.innerHTML = '';

    features.forEach(feature => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        
        const formatted = feature.properties.formatted;
        const city = feature.properties.city || '';
        const state = feature.properties.state || '';
        
        item.innerHTML = `
            <strong>${formatted}</strong>
            ${city || state ? `<br><small style="color: #999;">${city}${city && state ? ', ' : ''}${state}</small>` : ''}
        `;
        
        item.onclick = () => selectAddress(feature, listId);
        list.appendChild(item);
    });

    list.classList.add('show');
}

function selectAddress(feature, listId) {
    const inputId = listId.replace('List', ''); 
    const prefix = inputId.replace('-street', ''); 
    const input = document.getElementById(inputId);
    
    if (input) {
        input.value = feature.properties.street || ''; 
    }

    populateAddressFields(prefix, feature); 
    
    hideList(listId); 
}

function hideList(listId) {
    const list = document.getElementById(listId);
    if (list) {
        list.classList.remove('show');
    }
}

document.addEventListener('click', function(e) {
    if (!e.target.closest('.autocomplete-container')) {
        document.querySelectorAll('.autocomplete-list').forEach(list => list.classList.remove('show'));
    }
});

function clearAddressFields(prefix) {
    document.getElementById(`${prefix}-neighborhood`).value = '';
    document.getElementById(`${prefix}-city`).value = '';
    document.getElementById(`${prefix}-state`).value = '';

    if (prefix.includes('renter')) {
        document.getElementById(`${prefix}-lat`).value = '';
        document.getElementById(`${prefix}-lng`).value = '';
    }
}

function populateAddressFields(prefix, location) {
    const props = location.properties;
    
    document.getElementById(`${prefix}-neighborhood`).value = props.suburb || props.city_district || '';
    document.getElementById(`${prefix}-city`).value = props.city || '';
    document.getElementById(`${prefix}-state`).value = props.state_code || props.state || ''; 

    if (prefix.includes('renter')) {
        document.getElementById(`${prefix}-lat`).value = props.lat || '';
        document.getElementById(`${prefix}-lng`).value = props.lon || '';
    }
}


// --- CARREGAMENTO DINÂMICO DE ESTADO/CIDADE ---

async function loadStates(selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">Carregando estados...</option>';
    
    try {
        const response = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [
            Query.limit(5000) 
        ]);
        
        const renterStates = response.documents.map(renter => renter.state);
        const uniqueStates = [...new Set(renterStates)]; 
        uniqueStates.sort((a, b) => a.localeCompare(b)); 

        select.innerHTML = '<option value="">Selecione o Estado</option>';
        
        if (uniqueStates.length === 0) {
             select.innerHTML += '<option value="">Nenhum locador cadastrado</option>';
        } else {
            uniqueStates.forEach(state => {
                select.innerHTML += `<option value="${state}">${state}</option>`;
            });
        }
    } catch (error) {
        console.error("Erro ao carregar estados:", error);
        select.innerHTML = '<option value="">Erro ao carregar estados</option>';
    }
}

async function loadCities(state, selectId) {
    const select = document.getElementById(selectId);
    select.innerHTML = '<option value="">Selecione a Cidade</option>';
    
    if (!state) return;
    
    select.innerHTML = '<option value="">Carregando cidades...</option>';

    try {
        const response = await databases.listDocuments(DB_ID, RENTERS_COLLECTION_ID, [
            Query.equal('state', state),
            Query.limit(5000)
        ]);
        
        const renterCities = response.documents.map(renter => renter.city);
        const uniqueCities = [...new Set(renterCities)];
        
        uniqueCities.sort((a, b) => a.localeCompare(b)); 

        select.innerHTML = '<option value="">Selecione a Cidade</option>';
        if (uniqueCities.length === 0) {
             select.innerHTML += '<option value="">Nenhuma cidade com locadores</option>';
        } else {
            uniqueCities.forEach(city => {
                select.innerHTML += `<option value="${city}">${city}</option>`;
            });
        }
    } catch (error) {
        console.error("Erro ao carregar cidades:", error);
        select.innerHTML = '<option value="">Erro ao carregar cidades</option>';
    }
}
