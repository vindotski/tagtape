document.addEventListener("DOMContentLoaded", () => {
  initTagtapeForm();
});

function initTagtapeForm() {
  let tagtapeFormWrapper = document.querySelector("#tagtape-form-wrapper");
  let tagtapeForm = tagtapeFormWrapper.querySelector("form");
  tagtapeForm.onsubmit = e => {
    e.preventDefault();
    toggleForm(tagtapeForm, false);
    postAjax(
      "/submit",
      serialize(tagtapeForm),
      data => {
        toggleForm(tagtapeForm, true);
        tagtapeForm.innerHTML = `
          <div style="margin-bottom: 5rem;">
            <h2>Done!</h2>
            <p>Automatic download of your files will start shortly.</p>
            <button type="button" onclick="reloadForm()">Convert more files</button>
          </div>
        `;
        data = JSON.parse(data).archiveName;
        let iframe = document.querySelector("iframe");
        iframe.setAttribute("src", "/download/" + data);
      },
      data => {
        tagtapeFormWrapper.innerHTML = data;
        initTagtapeForm();
        reinitTrackList();
        toggleForm(tagtapeForm, true);
      }
    );
  };
}

function reloadForm() {
  let tagtapeFormWrapper = document.querySelector("#tagtape-form-wrapper");
  let tagtapeForm = tagtapeFormWrapper.querySelector("form");

  toggleForm(tagtapeForm, false);
  postAjax(
    "/new-form",
    "",
    data => {
      tagtapeFormWrapper.innerHTML = data;
      initTagtapeForm();
      reinitTrackList();
      toggleForm(tagtapeForm, true);
      document.querySelector("form[name='album'] > div").remove();
    },
    data => {}
  );
}

function toggleForm(form, isEnabled) {
  form.classList.toggle("processing", !isEnabled);
  let elements = form.elements;
  for (var i = 0; i < elements.length; ++i) {
    let element = elements[i];
    if (element.tagName == "BUTTON") {
      element.disabled = !isEnabled;
    } else {
      element.readonly = !isEnabled;
    }
  }
}

function postAjax(url, data, success, failure) {
  var xhr = window.XMLHttpRequest
    ? new XMLHttpRequest()
    : new ActiveXObject("Microsoft.XMLHTTP");
  xhr.open("POST", url);
  xhr.onreadystatechange = function() {
    if (xhr.readyState < 4) return;
    if (xhr.status == 200) {
      success(xhr.responseText);
    } else {
      failure(xhr.responseText);
    }
  };
  xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
  xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  xhr.send(data);
  return xhr;
}

/*!
 * Serialize all form data into a query string
 * (c) 2018 Chris Ferdinandi, MIT License, https://gomakethings.com
 * @param  {Node}   form The form to serialize
 * @return {String}      The serialized form data
 */
var serialize = function(form) {
  // Setup our serialized data
  var serialized = [];

  // Loop through each field in the form
  for (var i = 0; i < form.elements.length; i++) {
    var field = form.elements[i];

    // Don't serialize fields without a name, submits, buttons, file and reset inputs, and disabled fields
    if (
      !field.name ||
      field.disabled ||
      field.type === "file" ||
      field.type === "reset" ||
      field.type === "submit" ||
      field.type === "button"
    )
      continue;

    // If a multi-select, get all selections
    if (field.type === "select-multiple") {
      for (var n = 0; n < field.options.length; n++) {
        if (!field.options[n].selected) continue;
        serialized.push(
          encodeURIComponent(field.name) +
            "=" +
            encodeURIComponent(field.options[n].value)
        );
      }
    }

    // Convert field data to a query string
    else if (
      (field.type !== "checkbox" && field.type !== "radio") ||
      field.checked
    ) {
      serialized.push(
        encodeURIComponent(field.name) + "=" + encodeURIComponent(field.value)
      );
    }
  }

  return serialized.join("&");
};
