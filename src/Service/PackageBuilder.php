<?php

namespace App\Service;

use App\Entity\Track;
use App\Entity\TrackMetadata;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Exception;
use PhpZip\ZipFile;

class PackageBuilder
{
  private $archivesDirectory;
  private $residualFiles;
  private $downloader;
  private $tagWriter;
  private $uuidGenerator;
  private $tracks;
  private $coverImage;
  private $finalized;

  public function __construct(string $archivesDirectory, Downloader $downloader, TagWriter $tagWriter, UUIDGenerator $uuidGenerator)
  {
    $this->archivesDirectory = $archivesDirectory;
    $this->downloader = $downloader;
    $this->tagWriter = $tagWriter;
    $this->uuidGenerator = $uuidGenerator;
    $this->tracks = new ArrayCollection();
    $this->residualFiles = new ArrayCollection();
  }

  public function add(Track $trackMetadata): void
  {
    if ($this->finalized) throw new Exception('Cannot add track metadata to finalized package builder.');

    if (!$this->tracks->contains($trackMetadata)) {
      $this->tracks->add($trackMetadata);
    }
  }

  /** @return string Absolute file path to the archive file */
  public function build(): string
  {
    if ($this->finalized) throw new Exception('Cannot perform build operation on finalized package builder.');
    $this->finalized = true;

    $archive = new ZipFile();
    try {
      $this->residualFiles->add($this->getCoverImage());

      foreach ($this->tracks as $track) {
        $file = $this->downloader->download($track->getSource());
        $this->residualFiles->add($file);

        $this->tagWriter->write($file, [
          'cover' => $this->getCoverImage(),
          'tracknumber' => $track->getNumber(),
          'title' => $track->getTitle(),
          'album' => $track->getAlbum()->getTitle(),
          'artist' => $track->getAlbum()->getArtist()->getName(),
          'year' => $track->getAlbum()->getYear()
        ]);
        $filename = $track->getNumber() . ' - ' . preg_replace('/[^A-Za-z0-9]+/', '-', $track->getTitle()) . '.mp3';
        $archive->addFile($file, $filename);
      }

      $archiveFilename = $this->getArchivesDirectory() . '/' . preg_replace('/[^A-Za-z0-9]+/', '-', strtolower($track->getAlbum()->getTitle())) . '_' . $this->uuidGenerator->generate() . '.zip';
      $archive->saveAsFile($archiveFilename);
    } finally {
      $archive->close();
    }

    return $archiveFilename;
  }

  public function getArchivesDirectory(): string
  {
    return $this->archivesDirectory;
  }

  /** @return Collection List of all downloaded files */
  public function getResidualFiles(): Collection
  {
    return $this->residualFiles;
  }

  public function getCoverImage(): ?string
  {
    return $this->coverImage;
  }

  public function setCoverImage(string $coverImage): void
  {
    $this->coverImage = $coverImage;
  }
}
