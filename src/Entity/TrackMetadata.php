<?php

namespace App\Entity;

use App\Form\TrackType;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Form\FormInterface;

/**
 * @ORM\Entity(repositoryClass="App\Repository\TrackMetadataRepository")
 */
class TrackMetadata
{
    /**
     * @ORM\Id()
     * @ORM\GeneratedValue()
     * @ORM\Column(type="integer")
     */
    private $id;

    /**
     * @ORM\Column(type="text")
     */
    private $sourceUrl;

    /**
     * @ORM\Column(type="integer", nullable=true)
     */
    private $trackNumber;

    /**
     * @ORM\Column(type="string", length=60, nullable=true)
     */
    private $title;

    /**
     * @ORM\Column(type="string", length=60, nullable=true)
     */
    private $album;

    /**
     * @ORM\Column(type="string", length=60, nullable=true)
     */
    private $artist;

    /**
     * @ORM\Column(type="string", length=4, nullable=true)
     */
    private $year;

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getSourceUrl(): ?string
    {
        return $this->sourceUrl;
    }

    public function setSourceUrl(string $sourceUrl): self
    {
        $this->sourceUrl = $sourceUrl;

        return $this;
    }

    public function getTrackNumber(): ?int
    {
        return $this->trackNumber;
    }

    public function setTrackNumber(?int $trackNumber): self
    {
        $this->trackNumber = $trackNumber;

        return $this;
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function setTitle(?string $title): self
    {
        $this->title = $title;

        return $this;
    }

    public function getAlbum(): ?string
    {
        return $this->album;
    }

    public function setAlbum(?string $album): self
    {
        $this->album = $album;

        return $this;
    }

    public function getArtist(): ?string
    {
        return $this->artist;
    }

    public function setArtist(?string $artist): self
    {
        $this->artist = $artist;

        return $this;
    }

    public function getYear(): ?string
    {
        return $this->year;
    }

    public function setYear(?string $year): self
    {
        $this->year = $year;

        return $this;
    }
}
