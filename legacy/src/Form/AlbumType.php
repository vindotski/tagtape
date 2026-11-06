<?php

namespace App\Form;

use App\Entity\Album;
use App\Validator\Constraint\RemoteFileSize;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\CollectionType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\Extension\Core\Type\UrlType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints\Count;
use Symfony\Component\Validator\Constraints\Length;
use Symfony\Component\Validator\Constraints\NotBlank;

class AlbumType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options)
    {
        $builder
            ->add('image', UrlType::class, [
                'label' => 'Image URL (optional)',
                'mapped' => false,
                'required' => false,
                'constraints' => [
                    new RemoteFileSize([
                        'max' => '300'
                    ])
                ]
            ])
            ->add('title', TextType::class, [
                'constraints' => [
                    new NotBlank(),
                    new Length([
                        'min' => 1,
                        'max' => 60
                    ])
                ]
            ])
            ->add('artist', ArtistType::class, [
                'label' => false
            ])
            ->add('genre', TextType::class, [
                'label' => 'Genre (optional)',
                'required' => false,
                'constraints' => [
                    new Length([
                        'min' => 1,
                        'max' => 30
                    ])
                ]
            ])
            ->add('year', TextType::class, [
                'label' => 'Year (optional)',
                'required' => false,
                'constraints' => [
                    new Length([
                        'max' => 4
                    ])
                ]
            ])
            ->add('tracks', CollectionType::class, [
                'entry_type' => TrackType::class,
                'entry_options' => [
                    'label' => false
                ],
                'allow_add' => true,
                'constraints' => [
                    new Count([
                        'min' => 1,
                        'max' => 10,
                        'minMessage' => 'You must specify at least one song',
                        'maxMessage' => 'You cannot specify more than {{ limit }} songs'
                    ])
                ]
            ]);
    }

    public function configureOptions(OptionsResolver $resolver)
    {
        $resolver->setDefaults([
            'data_class' => Album::class,
        ]);
    }
}
