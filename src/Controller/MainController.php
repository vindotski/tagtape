<?php

namespace App\Controller;

use App\Entity\TrackMetadata;
use App\Form\AlbumType;
use App\Service\DownloaderInterface;
use App\Service\TagWriterInterface;
use App\Service\UUIDGeneratorInterface;
use PhpZip\Exception\ZipException;
use PhpZip\ZipFile;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\ResponseHeaderBag;
use Symfony\Component\Routing\Annotation\Route;

class MainController extends AbstractController
{
    /**
     * @Route("/", name="home")
     */
    public function index(Request $request, DownloaderInterface $downloader, TagWriterInterface $tagWriter, UUIDGeneratorInterface $uuidGen)
    {
        $form = $this->createForm(AlbumType::class);

        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $archive = new ZipFile();
            try {
                $tempFiles = [];
                $tracks = $form->get('tracks');
                foreach ($tracks as $track) {
                    $trackMetadata = new TrackMetadata();
                    $trackMetadata->setSourceUrl($track->get('url')->getData());
                    $trackMetadata->setTrackNumber($track->get('number')->getData());
                    $trackMetadata->setTitle($track->get('title')->getData());
                    $trackMetadata->setAlbum($form->get('title')->getData());
                    $trackMetadata->setArtist($form->get('artist')->getData()->getName());
                    $trackMetadata->setYear($form->get('year')->getData());

                    $file = $downloader->download($trackMetadata->getSourceUrl());
                    array_push($tempFiles, $file);
                    $tagWriter->write($file, [
                        'cover' => 'nopicture.jpg',
                        'tracknumber' => $trackMetadata->getTrackNumber(),
                        'title' => $trackMetadata->getTitle(),
                        'album' => $trackMetadata->getAlbum(),
                        'artist' => $trackMetadata->getArtist(),
                        'year' => $trackMetadata->getYear()
                    ]);
                    $filename = $trackMetadata->getTrackNumber() . ' - ' . preg_replace('/[^A-Za-z0-9]+/', '-', $trackMetadata->getTitle()) . '.mp3';
                    $archive->addFile($file, $filename);
                }

                $downloadDirectory = $downloader->getDownloadDirectory();
                $archiveFilename = $downloadDirectory . '/' . preg_replace('/[^A-Za-z0-9]+/', '-', strtolower($trackMetadata->getAlbum())) . '_' . $uuidGen->generate() . '.zip';
                $archive->saveAsFile($archiveFilename);

                foreach ($tempFiles as $tempFile) {
                    unlink($tempFile);
                }

                $response = new BinaryFileResponse($archiveFilename);
                $response->setContentDisposition(ResponseHeaderBag::DISPOSITION_ATTACHMENT);
                return $response;
            } catch (ZipException $e) {
                return new JsonResponse($e->getTrace());
            } finally {
                $archive->close();
            }
        }

        return $this->render('main/index.html.twig', [
            'form' => $form->createView()
        ]);
    }
}
