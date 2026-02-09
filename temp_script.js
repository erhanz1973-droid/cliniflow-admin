  const API = "http://localhost:5050"; // Geçici olarak local
  
  function showAlert(message, type = "error") {
    const container = document.getElementById("alert-container");
    container.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
    setTimeout(() => {
      container.innerHTML = "";
    }, type === "error" ? 5000 : 3000);
  }

  function setMsg(message, type = "ok") {
    showAlert(message, type === "err" ? "error" : "success");
  }

  function updateUI() {
    if (typeof i18n === 'undefined') return;
    const titleEl = document.getElementById("pageTitle");
    const headingEl = document.getElementById("pageHeading");
    const subtitleEl = document.getElementById("pageSubtitle");
    if (titleEl) titleEl.textContent = i18n.t("login.title");
    if (headingEl) headingEl.textContent = i18n.t("login.title");
    if (subtitleEl) subtitleEl.textContent = i18n.t("login.subtitle");
    
    // Update button texts
    const submitBtn = document.getElementById("submit-btn");
    if (submitBtn && !submitBtn.disabled) {
      submitBtn.textContent = i18n.t("login.submit");
    }
  }
  
  window.onI18nUpdated = updateUI;

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Clear any existing admin token before login
    try {
      localStorage.removeItem("admin_token");
      console.log("[LOGIN] Cleared existing admin token before login");
    } catch (e) {
      console.error("[LOGIN] Error clearing token:", e);
    }
    
    const submitBtn = document.getElementById("submit-btn");
    const email = document.getElementById("email").value.trim().toLowerCase();
    const clinicCode = document.getElementById("clinicCode").value.trim().toUpperCase();
    const password = document.getElementById("password").value;
    
    if (!email) {
      setMsg(i18n.t("login.errors.emailRequired"), "err");
      return;
    }
    
    if (!clinicCode) {
      setMsg(i18n.t("login.errors.clinicCodeRequired"), "err");
      return;
    }
    
    if (!password) {
      setMsg(i18n.t("login.errors.passwordRequired"), "err");
      return;
    }
    
    submitBtn.disabled = true;
    submitBtn.textContent = i18n.t("login.submitLoading");
    
    console.log("[LOGIN] Sending login request:", { email, clinicCode, password: "***" });
    
    try {
      // Try production API first, fallback to localhost
      const apiToUse = API;
      console.log("[LOGIN] Using API:", apiToUse);
      
      const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, clinicCode, password }),
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        let errorMsg = json.message || json.error || i18n.t("login.errors.loginFailed");
        if (json.error === "invalid_admin_credentials") {
          errorMsg = i18n.t("login.errors.invalidCredentials");
        } else if (json.error === "email_required") {
          errorMsg = i18n.t("login.errors.emailRequired");
        } else if (json.error === "clinic_code_required") {
          errorMsg = i18n.t("login.errors.clinicCodeRequired");
        } else if (json.error === "password_required") {
          errorMsg = i18n.t("login.errors.passwordRequired");
        }
        setMsg(errorMsg, "err");
        submitBtn.disabled = false;
        submitBtn.textContent = i18n.t("login.submit");
        return;
      }
      
      if (json.ok && json.requiresOTP) {
        // OTP required - show OTP input form
        showOTPForm(json.clinicCode, json.email);
        return;
      }
      
      if (json.ok && json.token) {
        // Save token to localStorage (without Bearer prefix, adminHeaders adds it)
        localStorage.setItem("admin_token", json.token);
        localStorage.setItem("clinic_code", json.admin?.clinicCode || clinicCode);
        localStorage.setItem("clinic_name", json.admin?.clinicCode || clinicCode);
        
        setMsg(i18n.t("login.success", { name: json.admin?.clinicCode || clinicCode }), "ok");
        
        console.log("[LOGIN] Login successful, redirecting to dashboard...");
        
        // Redirect immediately to correct port
        window.location.href = "http://localhost:5050/admin.html";
      } else {
        setMsg(i18n.t("login.errors.loginFailed"), "err");
        submitBtn.disabled = false;
        submitBtn.textContent = i18n.t("login.submit");
      }
    } catch (error) {
      console.error("Login error:", error);
      setMsg(i18n.t("login.errors.genericError", { error: error.message || "Bilinmeyen hata" }), "err");
      submitBtn.disabled = false;
      submitBtn.textContent = i18n.t("login.submit");
    }
  });

  // Show OTP verification form
  function showOTPForm(clinicCode, email) {
    const formContainer = document.querySelector('.form-container');
    
    // Hide login form and show OTP form
    formContainer.innerHTML = `
      <div class="header">
        <h1 data-i18n="login.otpTitle">OTP Verification</h1>
        <p class="subtitle" data-i18n="login.otpSubtitle">Enter the verification code sent to your email</p>
      </div>
      
      <form id="otp-form">
        <div class="form-group">
          <label>
            <span data-i18n="login.clinicCode">Clinic Code</span>
          </label>
          <input
            type="text"
            value="${clinicCode}"
            readonly
            style="background: var(--b);"
          />
        </div>

        <div class="form-group">
          <label>
            <span data-i18n="login.email">Email</span>
          </label>
          <input
            type="email"
            value="${email || ''}"
            id="otp-email"
            placeholder="Enter your email address"
            required
          />
          <div class="help-text" data-i18n="login.otpEmailHelp">Enter the email address where you received the OTP</div>
        </div>

        <div class="form-group">
          <label>
            <span data-i18n="login.otpCode">Verification Code</span> <span class="required" data-i18n="login.otpCodeRequired">*</span>
          </label>
          <input
            type="text"
            id="otp-code"
            name="otp"
            maxlength="6"
            pattern="[0-9]{6}"
            placeholder="123456"
            required
            autofocus
            style="font-size: 24px; text-align: center; letter-spacing: 8px;"
          />
          <div class="help-text" data-i18n="login.otpHelp">Enter the 6-digit code sent to your email</div>
        </div>

        <button type="submit" class="btn btn-primary" id="otp-submit-btn" data-i18n="login.verifyOTP">Verify OTP</button>
        <button type="button" class="btn btn-secondary" onclick="location.reload()" data-i18n="login.backToLogin">Back to Login</button>
      </form>
      
      <div id="otp-message" style="margin-top: 16px;"></div>
    `;
    
    // Update i18n for new elements
    if (typeof i18n !== 'undefined' && i18n.updateUI) {
      i18n.updateUI();
    }
    
    // Handle OTP form submission
    document.getElementById('otp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = document.getElementById('otp-submit-btn');
      const email = document.getElementById('otp-email').value.trim();
      const otpCode = document.getElementById('otp-code').value.trim();
      
      if (!email) {
        setOTPMsg(i18n.t("login.errors.emailRequired"), "err");
        return;
      }
      
      if (!otpCode || otpCode.length !== 6) {
        setOTPMsg(i18n.t("login.errors.otpRequired"), "err");
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = i18n.t("login.verifying") + "...";
      
      try {
        const res = await fetch(`${API}/api/admin/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            clinicCode: clinicCode,
            email: email,
            otp: otpCode 
          }),
        });
        
        const json = await res.json();
        
        if (!res.ok) {
          let errorMsg = json.message || json.error || i18n.t("login.errors.otpFailed");
          if (json.error === "invalid_otp") {
            errorMsg = i18n.t("login.errors.invalidOTP");
          } else if (json.error === "otp_not_found") {
            errorMsg = i18n.t("login.errors.otpNotFound");
          } else if (json.error === "otp_expired") {
            errorMsg = i18n.t("login.errors.otpExpired");
          }
          setOTPMsg(errorMsg, "err");
          submitBtn.disabled = false;
          submitBtn.textContent = i18n.t("login.verifyOTP");
          return;
        }
        
        if (json.ok && json.token) {
          // Save token and redirect
          localStorage.setItem("admin_token", json.token);
          localStorage.setItem("clinic_code", json.clinicCode || clinicCode);
          localStorage.setItem("clinic_name", json.clinicName || "");
          
          setOTPMsg(i18n.t("login.success", { name: json.clinicName || clinicCode }), "ok");
          
          // Redirect to dashboard
          setTimeout(() => {
            window.location.href = "http://localhost:5050/admin.html";
          }, 1000);
        } else {
          setOTPMsg(i18n.t("login.errors.otpFailed"), "err");
          submitBtn.disabled = false;
          submitBtn.textContent = i18n.t("login.verifyOTP");
        }
      } catch (error) {
        console.error("OTP verification error:", error);
        setOTPMsg(i18n.t("login.errors.genericError", { error: error.message || "Bilinmeyen hata" }), "err");
        submitBtn.disabled = false;
        submitBtn.textContent = i18n.t("login.verifyOTP");
      }
    });
    
    // Auto-focus on OTP code input with delay
    setTimeout(() => {
      const otpInput = document.getElementById('otp-code');
      if (otpInput) {
        otpInput.focus();
      }
    }, 100);
  }
  
  function setOTPMsg(message, type) {
    const msgEl = document.getElementById('otp-message');
    if (!msgEl) return;
    
    msgEl.textContent = message;
    msgEl.className = type === "ok" ? "msg success" : "msg error";
    msgEl.style.display = "block";
  }

  // Wait for i18n to be ready
  if (typeof i18n !== 'undefined') {
    updateUI();
  } else {
    window.addEventListener('load', () => {
      setTimeout(updateUI, 100);
    });
  }

  // Auto-focus on clinic code input
  document.getElementById("clinicCode").focus();
