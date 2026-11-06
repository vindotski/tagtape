<?php

namespace App\Service;

class RemoteImageDownloader
{
  private $imagesDirectory;
  private $uuidGenerator;

  public function __construct(string $imagesDirectory, UUIDGenerator $uuidGenerator)
  {
    $this->imagesDirectory = $imagesDirectory;
    $this->uuidGenerator = $uuidGenerator;
  }

  public function download(string $url)
  {
    $downloader = new \greeflas\tools\ImageDownloader([
      'class' => \greeflas\tools\validators\ImageValidator::class
    ]);
    $fileName = $this->uuidGenerator->generate();
    $downloader->download($url, $this->getImagesDirectory(), $fileName);
    $imageFilename = $this->getImagesDirectory() . $fileName;
    $image = new \Gumlet\ImageResize($imageFilename);
    $image->quality_jpg = 100;
    $image->resize(1000, 1000, $allow_enlarge = true);
    $image->save($imageFilename, IMAGETYPE_JPEG);
    return $imageFilename;
  }

  public function getImagesDirectory()
  {
    return $this->imagesDirectory;
  }
}
