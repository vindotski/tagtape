document.addEventListener("DOMContentLoaded", () => {
  let trackList = document.querySelector("#track-list");
  let addTrackButton = document.querySelector("#add-track");

  document.addEventListener("click", (e) => {
    if (e.target && e.target.classList.contains('remove-track')) {
      e.target.parentElement.remove();
    }
  });

  initTrackList(trackList, addTrackButton);
  addTrackToTrackList(trackList);
});

function initTrackList(trackList, addTrackButton) {
  let trackCount = trackList.querySelectorAll("li").length;
  trackList.setAttribute("data-track-count", trackCount);

  addTrackButton.addEventListener("click", e => {
    addTrackToTrackList(trackList);
  });

  Sortable.create(trackList, {
    onChange: () => {
      let entries = trackList.querySelectorAll("li");
      entries.forEach((value, index) => {
        value.querySelector("[id$=_number]").value = index + 1;
      });
    }
  });
}

function addTrackToTrackList(trackList) {
  let trackPrototype = trackList.getAttribute("data-prototype");
  let trackCount = trackList.getAttribute("data-track-count");

  trackPrototype = trackPrototype.replace(/__name__/g, trackCount);
  trackList.setAttribute("data-track-count", ++trackCount);

  let trackFormEntry = document.createElement("li");
  trackFormEntry.innerHTML = trackPrototype;
  trackList.appendChild(trackFormEntry);
  trackFormEntry.querySelector("[id$=_number]").value = trackCount;
  let removeTrackButton = document.createElement("button");
  removeTrackButton.setAttribute("type", "button");
  removeTrackButton.innerHTML = "&#215;";
  removeTrackButton.classList.add("button", "button-clear", "remove-track");
  trackFormEntry.querySelector('div').appendChild(removeTrackButton);
}
