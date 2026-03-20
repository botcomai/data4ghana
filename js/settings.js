let currentUser = null;
let currentAvatarUrl = null;

// 1. Initialization and Loading
document.addEventListener("DOMContentLoaded", async () => {
    if (!window.supabase) return;

    const { data: { user }, error } = await window.supabase.auth.getUser();
    if (!user || error) {
        window.location.href = "login.html";
        return;
    }
    currentUser = user;

    loadUserProfile();
});

async function loadUserProfile() {
    try {
        const { data, error } = await window.supabase
            .from('users')
            .select('first_name, last_name, phone, email, business_name, region, avatar_url, is_free_mode, balance_owed')
            .eq('id', currentUser.id)
            .single();

        if (error) throw error;

        // Populate Text Fields
        if(data.first_name) document.getElementById('fName').value = data.first_name;
        if(data.last_name) document.getElementById('lName').value = data.last_name;
        if(data.phone) document.getElementById('phone').value = data.phone;
        if(data.email) document.getElementById('email').value = data.email;
        if(data.business_name) document.getElementById('businessName').value = data.business_name;
        if(data.region) document.getElementById('region').value = data.region;

        // Populate Avatar
        if(data.avatar_url) {
            currentAvatarUrl = data.avatar_url;
            setAvatarPreview(data.avatar_url);
        } else {
            let init = (data.first_name?.charAt(0) || '') + (data.last_name?.charAt(0) || '');
            document.getElementById('settingsInitials').innerText = init.toUpperCase() || 'D4';
        }

        // Account mode visibility
        const modeElem = document.getElementById('settingsAccountMode');
        const owedElem = document.getElementById('settingsBalanceOwed');
        const hintElem = document.getElementById('settingsModeHint');
        const freeModeOn = data.is_free_mode === true;
        const owed = Number(data.balance_owed || 0).toFixed(2);

        if (modeElem) {
            modeElem.innerText = freeModeOn ? 'Free Mode' : 'Standard';
            modeElem.classList.remove('free', 'neutral');
            modeElem.classList.add(freeModeOn ? 'free' : 'neutral');
        }

        if (owedElem) {
            owedElem.innerText = `₵${owed}`;
        }

        if (hintElem) {
            hintElem.innerText = freeModeOn
                ? 'Orders may be deferred and added to your balance owed while Free Mode is active.'
                : 'Payments are processed normally from your wallet balance.';
        }

    } catch (err) {
        console.error("Failed to load profile:", err);
    }
}

// 2. Avatar Local Preview Engine
const avatarUpload = document.getElementById('avatarUpload');
avatarUpload.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            setAvatarPreview(e.target.result);
        }
        reader.readAsDataURL(file);
    }
});

function setAvatarPreview(src) {
    const box = document.getElementById('settingsAvatarBox');
    box.innerHTML = `<img src="${src}" style="width:100%; height:100%; object-fit:cover;">`;
}

// 3. Avatar Upload to Supabase Storage
async function uploadAvatar() {
    const file = avatarUpload.files[0];
    if(!file) {
        alert("Please select an image first.");
        return;
    }

    const btn = document.getElementById('saveAvatarBtn');
    btn.disabled = true;
    btn.innerText = "Uploading...";

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}_${Date.now()}.${fileExt}`;
        const filePath = `${currentUser.id}/${fileName}`;

        // Upload to bucket
        const { error: uploadError } = await window.supabase.storage
            .from('avatars')
            .upload(filePath, file);

        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);

        // Get Public URL
        const { data: { publicUrl } } = window.supabase.storage
            .from('avatars')
            .getPublicUrl(filePath);

        // Update Users Table record
        const { error: dbError } = await window.supabase
            .from('users')
            .update({ avatar_url: publicUrl })
            .eq('id', currentUser.id);

        if (dbError) throw new Error("Failed to link avatar to profile: " + dbError.message);

        if(window.showSuccessPopup) {
            window.showSuccessPopup("Avatar Updated", "Your profile picture has been successfully changed.", () => {
                window.location.reload();
            });
        }

    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.innerText = "Update Avatar";
    }
}

// 4. Update Registration Details
document.getElementById('detailsForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const fName = document.getElementById('fName').value;
    const lName = document.getElementById('lName').value;
    const phone = document.getElementById('phone').value;
    const email = document.getElementById('email').value;
    const businessName = document.getElementById('businessName').value;
    const region = document.getElementById('region').value;

    const btn = document.getElementById('saveDetailsBtn');
    btn.disabled = true;
    btn.innerText = "Saving...";

    try {
        // Update Users Table record
        const { error: dbError } = await window.supabase
            .from('users')
            .update({ 
                first_name: fName,
                last_name: lName,
                phone: phone,
                email: email,
                business_name: businessName,
                region: region
            })
            .eq('id', currentUser.id);

        if (dbError) throw new Error("Failed to save changes: " + dbError.message);

        // Update internal Auth metadata (crucial for syncing session states if requested by other pages)
        const { error: authError } = await window.supabase.auth.updateUser({
            email: email,
            data: { 
                first_name: fName, 
                last_name: lName, 
                phone: phone,
                business_name: businessName,
                region: region
            }
        });

        if (authError) throw new Error("Failed to update auth info: " + authError.message);

        if(window.showSuccessPopup) {
            window.showSuccessPopup("Profile Updated", "Your registration details have been securely saved.", () => {
                window.location.reload();
            });
        } else {
            alert("Settings Saved!");
            window.location.reload();
        }

    } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.innerText = "Save Changes";
    }
});
