document.addEventListener("DOMContentLoaded", () => {
  let trackList = document.querySelector("#track-list");
  let addTrackButton = document.querySelector("#add-track");
  let trackCounter = document.querySelector("#track-counter");

  document.addEventListener("click", e => {
    if (e.target && e.target.classList.contains("track-remove")) {
      e.target.parentElement.parentElement.parentElement.remove();
      updateTrackNumbers(trackList, trackCounter);
    }
  });

  initTrackList(trackList, addTrackButton, trackCounter);
  addTrackToTrackList(trackList, trackCounter);
});

function initTrackList(trackList, addTrackButton, trackCounter) {
  let trackCount = trackList.querySelectorAll("li").length;
  trackList.setAttribute("data-track-count", trackCount);
  trackList.classList.toggle(
    "disable-remove-buttons",
    trackList.querySelectorAll("li").length <= 1
  );

  addTrackButton.addEventListener("click", e => {
    addTrackToTrackList(trackList, trackCounter);
  });

  Sortable.create(trackList, {
    onChange: () => {
      let entries = trackList.querySelectorAll("li");
      entries.forEach((value, index) => {
        updateTrackNumbers(trackList, trackCounter);
      });
    }
  });
}

function addTrackToTrackList(trackList, trackCounter) {
  let trackPrototype = trackList.getAttribute("data-prototype");
  let trackCount = trackList.getAttribute("data-track-count");
  trackCount++;

  trackPrototype = trackPrototype.replace(/__name__/g, trackCount);
  let trackFormEntry = document.createElement("li");
  trackFormEntry.innerHTML = trackPrototype;
  trackList.appendChild(trackFormEntry);

  updateTrackNumbers(trackList, trackCounter);
}

function updateTrackNumbers(trackList, trackCounter) {
  let allTracks = trackList.querySelectorAll("li");
  let trackCount = allTracks.length;
  trackList.setAttribute("data-track-count", trackCount);
  trackCounter.innerHTML = trackCount;
  trackList.classList.toggle("disable-remove-buttons", trackCount <= 1);
  document.querySelector("#add-track").style.display = trackCount >= 10 ? "none" : "block";

  for (let i = 0; i < allTracks.length; i++) {
    let element = allTracks[i];
    let trackIndex = i + 1;

    element.querySelector("[id$=_number]").value = trackIndex;
    element.querySelector(".title").innerHTML = "Track " + trackIndex;

    let labels = element.querySelectorAll("label");
    Array.from(labels).forEach(label => {
      let forAttribute = label.getAttribute("for");
      label.setAttribute("for", forAttribute.replace(/[0-9]/g, trackIndex));
    });

    let inputs = element.querySelectorAll("input");
    Array.from(inputs).forEach(input => {
      input.id = input.id.replace(/[0-9]/g, trackIndex);
      input.name = input.name.replace(/[0-9]/g, trackIndex);
    });
  }
}
