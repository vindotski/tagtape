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
    return $this->getImagesDirectory() . $fileName;
  }

  public function getImagesDirectory()
  {
    return $this->imagesDirectory;
  }
}
