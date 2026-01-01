const supabaseClient = supabase.createClient(
  "https://twdginhsctejjqyfwqxm.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3ZGdpbmhzY3RlampxeWZ3cXhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY2OTg3NTEsImV4cCI6MjA4MjI3NDc1MX0.7x5TdZGIGb8-icaJKWC9YWhCxbllZ7Zyz9fthDsFoUc"
);

let CURRENT_USER = null;
let PROFILE = null;
let RECEIVER_PROFILE = null;
let TRANSFER_AMOUNT = 0;

const DAILY_LIMIT = 5000;

/* 🚀 LOAD DASHBOARD */
async function loadDashboard(){
  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) {
    location.href = "../auth/login.html";
    return;
  }

  CURRENT_USER = user;

  // 🔍 Fetch profile
  let { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // 🧠 AUTO-CREATE PROFILE IF MISSING
  if (!profile) {
    const newProfile = {
      id: user.id,
      full_name: user.user_metadata?.full_name || "New User",
      balance: 0,
      bank_name: "StarBank",
      account_number: Math.floor(1000000000 + Math.random() * 9000000000).toString()
    };

    const { error: insertError } = await supabaseClient
      .from("profiles")
      .insert(newProfile);

    if (insertError) {
      alert("Profile creation failed");
      console.error(insertError);
      return;
    }

    // Re-fetch profile
    const res = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();

    profile = res.data;
  }

  PROFILE = profile;

  renderProfile();
  loadTransactions();
}

/* 👤 RENDER PROFILE */
function renderProfile(){
  if (!PROFILE) return;

  if (window.userName) {
    userName.textContent = PROFILE.full_name || "User";
  }

  if (window.profileInfo) {
    profileInfo.innerHTML = `
      <p><strong>Email:</strong> ${CURRENT_USER.email}</p>
      <p><strong>Account Number:</strong> ${PROFILE.account_number}</p>
    `;
  }

  if (window.balanceCard) {
    balanceCard.textContent = `Balance: $${PROFILE.balance ?? 0}`;
  }

  if (window.accountCard) {
    accountCard.textContent = `Account #: ${PROFILE.account_number}`;
  }

  if (window.bankCard) {
    bankCard.textContent = `Bank: ${PROFILE.bank_name || "StarBank"}`;
  }
}

/* 🔍 LOOKUP RECIPIENT */
async function lookupRecipient(){
  const acc = recipientAccount.value.trim();
  recipientInfo.style.display = "none";

  if (acc.length < 5) return;

  if (acc === PROFILE.account_number) {
    recipientInfo.style.display = "block";
    recipientInfo.innerHTML = `<strong style="color:red">You cannot send money to yourself</strong>`;
    RECEIVER_PROFILE = null;
    return;
  }

  const { data } = await supabaseClient
    .from("profiles")
    .select("id, full_name, bank_name")
    .eq("account_number", acc)
    .maybeSingle();

  if (!data) {
    recipientInfo.style.display = "block";
    recipientInfo.innerHTML = `<strong style="color:red">Account not found</strong>`;
    RECEIVER_PROFILE = null;
    return;
  }

  RECEIVER_PROFILE = data;
  recipientInfo.style.display = "block";
  recipientInfo.innerHTML = `
    <strong>Recipient:</strong> ${data.full_name}<br>
    <strong>Bank:</strong> ${data.bank_name}
  `;
}

/* 🔐 STEP 1: INITIATE TRANSFER */
async function initiateTransfer(){
  TRANSFER_AMOUNT = Number(transferAmount.value);

  if (!RECEIVER_PROFILE) return alert("Invalid recipient");
  if (TRANSFER_AMOUNT <= 0) return alert("Invalid amount");
  if (TRANSFER_AMOUNT > PROFILE.balance) return alert("Insufficient balance");

  const { data: txs } = await supabaseClient
    .from("transactions")
    .select("amount")
    .eq("sender_id", CURRENT_USER.id)
    .gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString());

  const todayTotal = (txs || []).reduce((sum, t) => sum + Number(t.amount), 0);

  if (todayTotal + TRANSFER_AMOUNT > DAILY_LIMIT) {
    return alert(`Daily transfer limit of $${DAILY_LIMIT} exceeded`);
  }

  const { data: otp, error } = await supabaseClient.rpc("initiate_transfer", {
    p_sender_id: CURRENT_USER.id,
    p_receiver_id: RECEIVER_PROFILE.id,
    p_amount: TRANSFER_AMOUNT
  });

  if (error) return alert(error.message);

  alert(`Your OTP is: ${otp}`);
  otpBox.style.display = "block";
}

/* 🔐 STEP 2: CONFIRM TRANSFER */
async function confirmTransfer(){
  const otp = otpInput.value.trim();
  if (!otp) return alert("Enter OTP");

  const { error } = await supabaseClient.rpc("secure_transfer", {
    p_sender_id: CURRENT_USER.id,
    p_receiver_id: RECEIVER_PROFILE.id,
    p_amount: TRANSFER_AMOUNT,
    p_input_otp: otp
  });

  if (error) return alert(error.message);

  alert("Transfer completed");
  location.reload();
}

/* 📜 TRANSACTIONS */
async function loadTransactions(){
  if (!window.transactions) return;

  const { data } = await supabaseClient
    .from("transactions")
    .select("*")
    .or(`sender_id.eq.${CURRENT_USER.id},receiver_id.eq.${CURRENT_USER.id}`)
    .order("created_at", { ascending: false });

  transactions.innerHTML = "";

  (data || []).forEach(tx => {
    const dir = tx.sender_id === CURRENT_USER.id ? "Sent" : "Received";
    transactions.innerHTML += `
      <div class="tx-card">
        <strong>${dir}</strong> — $${tx.amount}<br>
        <span class="status-${tx.status}">${tx.status}</span><br>
        <small>${new Date(tx.created_at).toLocaleString()}</small>
      </div>
    `;
  });
}

/* 🚪 LOGOUT */
if (window.logoutBtn) {
  logoutBtn.onclick = async () => {
    await supabaseClient.auth.signOut();
    location.href = "../auth/login.html";
  };
}

loadDashboard();
