// --- FUNÇÃO CORRIGIDA COM TRIM (REMOÇÃO DE ESPAÇOS) ---

async function recoverPassword(event, type) {
    event.preventDefault();
    
    // 1. Seleciona o campo correto dependendo se é Usuário ou Locador
    const inputId = (type === 'user') ? 'recover-user-email' : 'recover-renter-email';
    const rawEmail = document.getElementById(inputId).value;
    
    // 2. O TRUQUE: .trim() remove espaços vazios antes e depois do e-mail
    const email = rawEmail.trim(); 

    // Debug: Mostra no console exatamente o que está sendo enviado (com aspas para ver espaços)
    console.log(`Tentando recuperar para o e-mail: '${email}'`);

    if (!email) {
        return showAlert('Por favor, digite um e-mail válido.');
    }

    try {
        // Monta a URL limpa para o retorno
        const urlObj = new URL(window.location.href);
        const resetUrl = `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`; 
        
        // Envia o pedido para o Appwrite
        await account.createRecovery(email, resetUrl);
        
        showAlert('Sucesso! Verifique seu e-mail (Caixa de Entrada e SPAM).', 'success');
        
        // Volta para a tela de login
        const targetLogin = (type === 'user') ? 'user-login' : 'renter-login';
        showScreen(targetLogin);
        
    } catch (error) {
         console.error("ERRO AO RECUPERAR:", error);
         
         // Se ainda der erro 404, é porque este e-mail REALMENTE não está no 'Auth'
         if (error.code === 404) {
             alert(`Erro: O e-mail '${email}' não foi encontrado no cadastro de autenticação.`);
         } else {
             alert(`Erro ao enviar: ${error.message}`);
         }
    }
}
