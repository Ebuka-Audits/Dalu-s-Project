(function () {
  // Theme: saves and applies straight away
  document.querySelectorAll('input[name="theme"]').forEach(r => r.addEventListener('change', async e => {
    try {
      await api('/api/settings/theme', 'PUT', { theme: e.target.value });
      document.documentElement.dataset.theme = e.target.value;
      note('#themeMsg', 'Saved.');
    } catch (err) { note('#themeMsg', err.message, true); }
  }));

  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/api/settings/profile', 'PUT', { name: $('#setName').value });
      document.querySelector('.who').textContent = r.name;
      note('#profileMsg', 'Name updated.');
    } catch (err) { note('#profileMsg', err.message, true); }
  });

  $('#emailForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/settings/email', 'PUT', { email: $('#setEmail').value, password: $('#emailPw').value });
      $('#emailPw').value = '';
      note('#emailMsg', 'Email updated. Use it the next time you log in.');
    } catch (err) { note('#emailMsg', err.message, true); }
  });

  $('#pwForm').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('#pwNew').value !== $('#pwConfirm').value) return note('#pwMsg', 'The new passwords do not match.', true);
    try {
      await api('/api/settings/password', 'PUT', { currentPassword: $('#pwCurrent').value, newPassword: $('#pwNew').value });
      e.target.reset();
      note('#pwMsg', 'Password changed.');
    } catch (err) { note('#pwMsg', err.message, true); }
  });

  $('#delForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!confirm('This permanently deletes your account and all your records. Continue?')) return;
    try {
      await api('/api/settings/account', 'DELETE', { password: $('#delPw').value });
      location.href = '/';
    } catch (err) { note('#delMsg', err.message, true); }
  });

  $('#rateForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('/api/settings/rate', 'PUT', { rate: $('#setRate').value });
      note('#rateMsg', $('#setRate').value ? 'Rate saved.' : 'Rate cleared.');
    } catch (err) { note('#rateMsg', err.message, true); }
  });

})();