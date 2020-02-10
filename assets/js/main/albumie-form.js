document.addEventListener("DOMContentLoaded", () => {
  initAlbumieForm();
});

function initAlbumieForm() {
  let albumieFormWrapper = document.querySelector("#albumie-form-wrapper");
  let albumieForm = albumieFormWrapper.querySelector("form");
  albumieForm.onsubmit = e => {
    e.preventDefault();
    postAjax(
      "/submit",
      serialize(albumieForm),
      data => {
        data = JSON.parse(data).archiveName;
        let iframe = document.querySelector("iframe");
        iframe.setAttribute("src", "/download/" + data);
      },
      data => {
        albumieFormWrapper.innerHTML = data;
        initAlbumieForm();
        reinitTrackList();
      }
    );
  };
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
