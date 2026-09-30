/* Article comments: API-backed, persistent, and rendered as text nodes. */

window.initializeIdeaComments = function(ideaId) {
  const form = document.getElementById('comment-form');
  const input = document.getElementById('comment-input');
  const postButton = document.getElementById('comment-post-button');
  const loginPrompt = document.getElementById('comment-login-prompt');
  const feedback = document.getElementById('comment-feedback');
  const list = document.getElementById('community-comments-list');
  const count = document.getElementById('community-comment-count');
  const statsCount = document.getElementById('stats-comments');
  const token = window.ApiClient?.getToken();
  let comments = [];

  if (!form || !input || !postButton || !list) return;
  form.hidden = !token;
  if (loginPrompt) loginPrompt.hidden = Boolean(token);

  const setCount = (value) => {
    if (count) count.textContent = String(value);
    if (statsCount) statsCount.textContent = String(value);
  };

  const setFeedback = (message, isError = false) => {
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle('error', isError);
  };

  const render = () => {
    list.replaceChildren();
    setCount(comments.length);

    if (!comments.length) {
      const empty = document.createElement('p');
      empty.className = 'comment-empty-state';
      empty.textContent = 'No comments yet.';
      list.appendChild(empty);
      return;
    }

    let currentUser = null;
    try {
      currentUser = JSON.parse(localStorage.getItem('tv_user') || 'null');
    } catch {}

    for (const comment of comments) {
      const card = document.createElement('article');
      card.className = 'community-comment-card';

      const meta = document.createElement('div');
      meta.className = 'community-comment-meta';
      const author = document.createElement('strong');
      author.className = 'community-comment-author';
      author.textContent = comment.userName || 'Trader';
      const timestamp = document.createElement('time');
      const commentDate = comment.createdAt ? new Date(comment.createdAt) : null;
      const validDate = commentDate && !Number.isNaN(commentDate.getTime());
      timestamp.dateTime = validDate ? commentDate.toISOString() : '';
      timestamp.textContent = validDate ? commentDate.toLocaleString() : '';
      meta.append(author, timestamp);

      if (token && currentUser?.id && String(currentUser.id) === String(comment.userId)) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'comment-delete-button';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('aria-label', 'Delete your comment');
        deleteButton.addEventListener('click', () => removeComment(comment, deleteButton));
        meta.appendChild(deleteButton);
      }

      const content = document.createElement('div');
      content.className = 'community-comment-content';
      content.textContent = comment.content || '';
      card.append(meta, content);
      list.appendChild(card);
    }
  };

  const removeComment = async (comment, button) => {
    button.disabled = true;
    setFeedback('');
    const response = await window.ApiClient.comments.delete(comment._id);
    if (!response.ok) {
      button.disabled = false;
      setFeedback(response.data?.message || 'Could not delete the comment. Please try again.', true);
      return;
    }
    comments = comments.filter((item) => item._id !== comment._id);
    render();
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = input.value.trim();
    if (!content) {
      setFeedback('Write a comment before posting.', true);
      return;
    }
    if (content.length > 2000) {
      setFeedback('Comments can be up to 2000 characters.', true);
      return;
    }

    postButton.disabled = true;
    setFeedback('');
    const response = await window.ApiClient.comments.create({ ideaId, content });
    postButton.disabled = false;
    if (!response.ok || !response.data?.data) {
      setFeedback(response.data?.message || 'Could not post the comment. Please try again.', true);
      return;
    }

    comments.push(response.data.data);
    input.value = '';
    render();
  });

  window.ApiClient.comments.getByIdea(ideaId).then((response) => {
    if (!response.ok || !Array.isArray(response.data?.data)) {
      setFeedback(response.data?.message || 'Could not load comments.', true);
      render();
      return;
    }
    comments = response.data.data;
    render();
  }).catch(() => {
    setFeedback('Could not load comments.', true);
    render();
  });
};
